import { db, auth, collection, onAuthStateChanged, signOut, updateDoc, doc, onSnapshot, query, orderBy, addDoc, getDocs, deleteDoc, Timestamp } from "./firebasec.js";
import { OrderPriorityQueue, Queue, Stack } from "./datastructures.js";

const DOM = {
    btnShowLiveOrders: document.getElementById('btnShowLiveOrders'),
    btnShowMenuManager: document.getElementById('btnShowMenuManager'),
    viewLiveOrders: document.getElementById('viewLiveOrders'),
    viewMenuManager: document.getElementById('viewMenuManager'),
    btnProcessNext: document.getElementById('btnProcessNext'),
    btnUndoCancel: document.getElementById('btnUndoCancel'),
    nextUpPreview: document.getElementById('nextUpPreview'),
    metricsPanel: document.getElementById('metricsPanel'),
    logoutBtn: document.getElementById('logoutBtn'),
    menuForm: document.getElementById('menuForm'),
    btnCancelEdit: document.getElementById('btnCancelEdit'),
    adminMenuList: document.getElementById('adminMenuList'),
    cols: {
        pending: document.getElementById('colPending'),
        preparing: document.getElementById('colPreparing'),
        ready: document.getElementById('colReady'),
        cancelled: document.getElementById('colCancelled')
    },
    counts: {
        pending: document.getElementById('countPending'),
        preparing: document.getElementById('countPreparing'),
        ready: document.getElementById('countReady'),
        cancelled: document.getElementById('countCancelled')
    }
};

let pendingQueue = new OrderPriorityQueue();
let preparingQueue = new Queue();
let readyQueue = new Queue();
let cancelledStack = new Stack();
let orderMap = new Map();
let menuItems = [];

const getPriorityText = (p) => p == 3 ? 'VIP' : p == 2 ? 'Urgent' : 'Regular';
const getPriorityClass = (p) => p == 3 ? 'tag-vip' : p == 2 ? 'tag-urgent' : 'tag-regular';

onAuthStateChanged(auth, (user) => {
    if (!user || user.email !== 'admin@orderease.com') {
        window.location.href = "index.html"; 
    } else {
        seedInitialMenu(); // Ensure the cloud DB has items
        initFirebaseListener();
        loadAdminMenu();
    }
});

async function seedInitialMenu() {
    const check = await getDocs(collection(db, "menu"));
    if (check.empty) {
        console.log("Seeding Cloud Menu...");
        const initialMenu = [
            { name: 'Truffle Fries', price: 12, category: 'Starters', description: 'Crispy golden fries with truffle oil and parmesan.', image: 'https://images.unsplash.com/photo-1573082801974-bc7111c7d6b0?q=80&w=200&h=200&auto=format&fit=crop' },
            { name: 'Signature Burger', price: 18, category: 'Main Course', description: 'Double wagyu beef patty with secret sauce.', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=200&h=200&auto=format&fit=crop' },
            { name: 'Iced Matcha Latte', price: 7, category: 'Beverages', description: 'Ceremonial grade matcha with oat milk.', image: 'https://images.unsplash.com/photo-1515823149273-dfd7af5509e7?q=80&w=200&h=200&auto=format&fit=crop' }
        ];
        for (const item of initialMenu) {
            await addDoc(collection(db, "menu"), item);
        }
        loadAdminMenu();
    }
}

// Tab Switching
DOM.btnShowLiveOrders.addEventListener('click', () => {
    DOM.viewLiveOrders.style.display = 'block';
    DOM.viewMenuManager.style.display = 'none';
    DOM.btnShowLiveOrders.classList.add('btn-primary');
    DOM.btnShowLiveOrders.classList.remove('btn-secondary');
    DOM.btnShowMenuManager.classList.add('btn-secondary');
    DOM.btnShowMenuManager.classList.remove('btn-primary');
});

DOM.btnShowMenuManager.addEventListener('click', () => {
    DOM.viewLiveOrders.style.display = 'none';
    DOM.viewMenuManager.style.display = 'block';
    DOM.btnShowMenuManager.classList.add('btn-primary');
    DOM.btnShowMenuManager.classList.remove('btn-secondary');
    DOM.btnShowLiveOrders.classList.add('btn-secondary');
    DOM.btnShowLiveOrders.classList.remove('btn-primary');
});

DOM.logoutBtn.addEventListener('click', async () => { await signOut(auth); });

DOM.btnProcessNext.addEventListener('click', async () => {
    const next = pendingQueue.peek();
    if (!next) {
        alert('No pending orders to process.');
        return;
    }
    await updateDoc(doc(db, 'orders', next.id), { status: 'preparing' });
});

DOM.btnUndoCancel.addEventListener('click', async () => {
    if (cancelledStack.isEmpty()) {
        alert('No cancelled orders to restore.');
        return;
    }
    const order = cancelledStack.pop();
    await updateDoc(doc(db, 'orders', order.id), { status: 'pending' });
});

// Menu Management Logic
document.getElementById('menuForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('menuItemId').value;
    const item = {
        name: document.getElementById('menuItemName').value,
        category: document.getElementById('menuItemCat').value,
        price: parseFloat(document.getElementById('menuItemPrice').value),
        description: document.getElementById('menuItemDesc').value,
        image: document.getElementById('menuItemImg').value
    };

    if (id) {
        await updateDoc(doc(db, "menu", id), item);
    } else {
        await addDoc(collection(db, "menu"), item);
    }
    document.getElementById('menuForm').reset();
    document.getElementById('menuItemId').value = '';
    DOM.btnCancelEdit.style.display = 'none';
    document.getElementById('imagePreview').style.display = 'none';
    loadAdminMenu();
});

// Image Upload Handler (Base64)
document.getElementById('menuItemFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
            const base64Str = re.target.result;
            document.getElementById('menuItemImg').value = base64Str;
            const preview = document.getElementById('imagePreview');
            preview.querySelector('img').src = base64Str;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

async function loadAdminMenu() {
    const snapshot = await getDocs(collection(db, "menu"));
    menuItems = [];
    snapshot.forEach(doc => { menuItems.push({ id: doc.id, ...doc.data() }); });
    renderAdminMenu();
}

function renderAdminMenu() {
    DOM.adminMenuList.innerHTML = menuItems.map(item => `
        <div class="admin-menu-item">
            <img src="${item.image}" alt="">
            <div style="flex:1">
                <strong>${item.name}</strong> ($${item.price.toFixed(2)})<br>
                <small>${item.category}</small>
            </div>
            <div style="display:flex; gap:0.5rem">
                <button class="btn btn-secondary" style="width:auto; padding:0.4rem" onclick="window.app.editMenuItem('${item.id}')"><i class="fa-solid fa-edit"></i></button>
                <button class="btn btn-small btn-cancel" style="width:auto; padding:0.4rem" onclick="window.app.deleteMenuItem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

window.app = {
    editMenuItem: (id) => {
        const item = menuItems.find(m => m.id === id);
        document.getElementById('menuItemId').value = item.id;
        document.getElementById('menuItemName').value = item.name;
        document.getElementById('menuItemCat').value = item.category;
        document.getElementById('menuItemPrice').value = item.price;
        document.getElementById('menuItemDesc').value = item.description;
        document.getElementById('menuItemImg').value = item.image;
        
        // Show current image preview
        const preview = document.getElementById('imagePreview');
        preview.querySelector('img').src = item.image;
        preview.style.display = 'block';
        
        DOM.btnCancelEdit.style.display = 'block';
    },
    deleteMenuItem: async (id) => {
        if(confirm("Delete this item?")) {
            await deleteDoc(doc(db, "menu", id));
            loadAdminMenu();
        }
    },
    updateStatus: async (id, newStatus) => {
        await updateDoc(doc(db, "orders", id), { status: newStatus });
    }
};

DOM.btnCancelEdit.addEventListener('click', () => {
    document.getElementById('menuForm').reset();
    document.getElementById('menuItemId').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    DOM.btnCancelEdit.style.display = 'none';
});

// Order Processing Logic (Same as before but with updated names)
function initFirebaseListener() {
    onSnapshot(query(collection(db, "orders"), orderBy("timestamp", "asc")), (snapshot) => {
        pendingQueue = new OrderPriorityQueue();
        preparingQueue = new Queue();
        readyQueue = new Queue();
        cancelledStack = new Stack();
        orderMap.clear();

        snapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const order = { id: docSnapshot.id, ...data, timestamp: data.timestamp.toMillis() };
            orderMap.set(order.id, order);

            switch(order.status) {
                case 'pending': pendingQueue.push(order); break;
                case 'preparing': preparingQueue.enqueue(order); break;
                case 'ready': readyQueue.enqueue(order); break;
                case 'cancelled': cancelledStack.push(order); break;
            }
        });
        renderBoard();
    });
}

function renderBoard() {
    renderColumn(DOM.cols.pending, pendingQueue.getAll(), DOM.counts.pending);
    renderColumn(DOM.cols.preparing, preparingQueue.getAll(), DOM.counts.preparing);
    renderColumn(DOM.cols.ready, readyQueue.getAll(), DOM.counts.ready);
    renderColumn(DOM.cols.cancelled, cancelledStack.getAll(), DOM.counts.cancelled);
    const next = pendingQueue.peek();
    DOM.nextUpPreview.innerHTML = next ? `<span class="priority-tag ${getPriorityClass(next.priority)}">${next.customerName}</span>` : "No pending orders";
    renderMetrics();
}

function renderColumn(container, items, countEl) {
    container.innerHTML = '';
    countEl.textContent = items.length;
    items.forEach(order => {
        const card = document.createElement('div');
        card.className = `order-card priority-${order.priority}`;
        card.innerHTML = `
            <div class="order-header">
                <span class="order-id">#${order.id.slice(-5).toUpperCase()}</span>
                <strong>$${order.total ? order.total.toFixed(2) : '0.00'}</strong>
            </div>
            <div class="customer-name">${order.customerName}</div>
            <div class="order-items">${order.items}</div>
            <div class="order-actions">${getActionButtons(order)}</div>
        `;
        container.appendChild(card);
    });
}

function getActionButtons(order) {
    if (order.status === 'pending') return `<button class="btn-small btn-process" onclick="window.app.updateStatus('${order.id}', 'preparing')">Cook</button>`;
    if (order.status === 'preparing') return `<button class="btn-small btn-process" onclick="window.app.updateStatus('${order.id}', 'ready')">Ready</button>`;
    if (order.status === 'ready') return `<button class="btn-small btn-process" onclick="window.app.updateStatus('${order.id}', 'delivered')">Deliver</button>`;
    return '';
}

function renderMetrics() {
    let delivered = Array.from(orderMap.values()).filter(o => o.status === 'delivered').length;
    DOM.metricsPanel.innerHTML = `
        <div class="glass-panel metric-card">
            <div class="metric-icon"><i class="fa-solid fa-truck-fast"></i></div>
            <div class="metric-data"><h4>Total Orders</h4><div class="value">${orderMap.size}</div></div>
        </div>
        <div class="glass-panel metric-card">
            <div class="metric-icon"><i class="fa-solid fa-check-circle"></i></div>
            <div class="metric-data"><h4>Delivered</h4><div class="value">${delivered}</div></div>
        </div>
    `;
}

DOM.btnProcessNext.addEventListener('click', async () => {
    const next = pendingQueue.peek();
    if (next) await window.app.updateStatus(next.id, 'preparing');
});

DOM.btnUndoCancel.addEventListener('click', async () => {
    if (!cancelledStack.isEmpty()) await window.app.updateStatus(cancelledStack.pop().id, 'pending');
});
