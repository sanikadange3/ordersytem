import { db, auth, collection, onAuthStateChanged, signOut, updateDoc, doc, onSnapshot, query, orderBy, where, addDoc, Timestamp, getDocs } from "./firebasec.js";
import { OrderPriorityQueue, Queue, Stack } from "./datastructures.js";

const DOM = {
    logoutBtn: document.getElementById('logoutBtn'),
    userGreeting: document.getElementById('userGreeting'),
    btnShowMenu: document.getElementById('btnShowMenu'),
    btnShowOrders: document.getElementById('btnShowOrders'),
    viewMenu: document.getElementById('viewMenu'),
    viewOrders: document.getElementById('viewOrders'),
    menuContainer: document.getElementById('menuContainer'),
    cartItemsList: document.getElementById('cartItemsList'),
    cartTotalText: document.getElementById('cartTotalText'),
    btnCheckout: document.getElementById('btnCheckout'),
    categoryTabs: document.querySelectorAll('.tab'),
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

let cart = [];
let menuItems = [];
let selectedCategory = 'All';
let currentUser = null;

// Real-time Data Structures for Order Tracking
let pendingQueue = new OrderPriorityQueue();
let preparingQueue = new Queue();
let readyQueue = new Queue();
let historyStack = new Stack();

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html"; 
    } else if (user.email === 'admin@orderease.com') {
        window.location.href = "admin.html";
    } else {
        currentUser = user;
        const name = localStorage.getItem('userName') || user.displayName || user.email.split('@')[0];
        DOM.userGreeting.innerText = `Welcome back, ${name}! Ready to eat?`;
        loadMenu();
        initUserOrderListener();
    }
});

// View Toggle Logic
DOM.btnShowMenu.addEventListener('click', () => {
    DOM.viewMenu.style.display = 'grid';
    DOM.viewOrders.style.display = 'none';
    DOM.btnShowMenu.classList.add('btn-primary');
    DOM.btnShowMenu.classList.remove('btn-secondary');
    DOM.btnShowOrders.classList.add('btn-secondary');
    DOM.btnShowOrders.classList.remove('btn-primary');
});

DOM.btnShowOrders.addEventListener('click', () => {
    DOM.viewMenu.style.display = 'none';
    DOM.viewOrders.style.display = 'grid';
    DOM.btnShowOrders.classList.add('btn-primary');
    DOM.btnShowOrders.classList.remove('btn-secondary');
    DOM.btnShowMenu.classList.add('btn-secondary');
    DOM.btnShowMenu.classList.remove('btn-primary');
});

DOM.logoutBtn.addEventListener('click', async () => { await signOut(auth); });

// Menu & Category Logic
async function loadMenu() {
    const snapshot = await getDocs(collection(db, "menu"));
    menuItems = [];
    snapshot.forEach(doc => {
        menuItems.push({ id: doc.id, ...doc.data() });
    });
    renderMenu();
}

DOM.categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        DOM.categoryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedCategory = tab.getAttribute('data-category');
        renderMenu();
    });
});

function renderMenu() {
    const filtered = selectedCategory === 'All' ? menuItems : menuItems.filter(m => m.category === selectedCategory);
    DOM.menuContainer.innerHTML = filtered.map(item => `
        <div class="menu-card">
            <img src="${item.image}" class="menu-img" alt="${item.name}">
            <div class="menu-info">
                <div class="menu-cat">${item.category}</div>
                <div class="menu-name">${item.name}</div>
                <div class="menu-desc">${item.description}</div>
                <div class="menu-footer">
                    <div class="menu-price">$${item.price.toFixed(2)}</div>
                    <button class="btn btn-primary" style="width: auto; padding: 0.5rem 1rem;" onclick="window.app.addToCart('${item.id}')">
                        <i class="fa-solid fa-plus"></i> Add
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Shopping Cart Logic
window.app = {
    addToCart: (id) => {
        const item = menuItems.find(m => m.id === id);
        const cartItem = cart.find(c => c.id === id);
        if (cartItem) {
            cartItem.qty++;
        } else {
            cart.push({ ...item, qty: 1 });
        }
        renderCart();
    },
    updateQty: (id, change) => {
        const index = cart.findIndex(c => c.id === id);
        cart[index].qty += change;
        if (cart[index].qty <= 0) cart.splice(index, 1);
        renderCart();
    },
    cancelOrder: async (id) => {
        if(confirm("Cancel order?")) await updateDoc(doc(db, "orders", id), { status: 'cancelled' });
    }
};

function renderCart() {
    if (cart.length === 0) {
        DOM.cartItemsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">Your cart is empty.</p>';
        DOM.btnCheckout.disabled = true;
    } else {
        DOM.cartItemsList.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h5>${item.name}</h5>
                    <span>$${(item.price * item.qty).toFixed(2)}</span>
                </div>
                <div class="cart-qty">
                    <i class="fa-solid fa-minus" style="cursor:pointer" onclick="window.app.updateQty('${item.id}', -1)"></i>
                    <span>${item.qty}</span>
                    <i class="fa-solid fa-plus" style="cursor:pointer" onclick="window.app.updateQty('${item.id}', 1)"></i>
                </div>
            </div>
        `).join('');
        DOM.btnCheckout.disabled = false;
    }
    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    DOM.cartTotalText.innerText = `$${total.toFixed(2)}`;
}

// Checkout Logic
DOM.btnCheckout.addEventListener('click', async () => {
    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const itemsText = cart.map(c => `${c.qty}x ${c.name}`).join(', ');
    const maxPriority = cart.some(c => c.price > 15) ? 2 : 1; // Basic logic for priority
    
    DOM.btnCheckout.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking out...';
    try {
        await addDoc(collection(db, "orders"), {
            uid: currentUser.uid,
            customerName: localStorage.getItem('userName') || currentUser.displayName || currentUser.email.split('@')[0],
            items: itemsText,
            total: total,
            priority: maxPriority,
            status: 'pending',
            timestamp: Timestamp.now()
        });
        cart = [];
        renderCart();
        alert("Order placed successfully! Switch to 'Track Orders' to see it.");
    } catch (e) {
        alert("Checkout failed.");
    }
    DOM.btnCheckout.innerHTML = 'Place Order';
});

// Order Tracker Logic (Real-time Kanban)
function initUserOrderListener() {
    onSnapshot(query(collection(db, "orders"), where("uid", "==", currentUser.uid)), (snapshot) => {
        pendingQueue = new OrderPriorityQueue();
        preparingQueue = new Queue();
        readyQueue = new Queue();
        historyStack = new Stack();

        snapshot.forEach(doc => {
            const data = doc.data();
            const order = { id: doc.id, ...data, timestamp: data.timestamp.toMillis() };
            if (order.status === 'pending') pendingQueue.push(order);
            else if (order.status === 'preparing') preparingQueue.enqueue(order);
            else if (order.status === 'ready') readyQueue.enqueue(order);
            else historyStack.push(order);
        });
        renderOrderBoard();
    });
}

function renderOrderBoard() {
    renderCol(DOM.cols.pending, pendingQueue.getAll(), DOM.counts.pending, true);
    renderCol(DOM.cols.preparing, preparingQueue.getAll(), DOM.counts.preparing);
    renderCol(DOM.cols.ready, readyQueue.getAll(), DOM.counts.ready);
    renderCol(DOM.cols.cancelled, historyStack.getAll(), DOM.counts.cancelled);
}

function renderCol(container, items, countEl, showCancel = false) {
    container.innerHTML = '';
    countEl.innerText = items.length;
    items.forEach(order => {
        const card = document.createElement('div');
        card.className = `order-card priority-${order.priority}`;
        card.innerHTML = `
            <div class="order-header">
                <span class="order-id">#${order.id.slice(-5).toUpperCase()}</span>
                <span style="font-weight:700">$${order.total ? order.total.toFixed(2) : '0.00'}</span>
            </div>
            <div class="order-items">${order.items}</div>
            ${showCancel ? `<button class="btn-cancel-only" onclick="window.app.cancelOrder('${order.id}')">Cancel Item</button>` : ''}
        `;
        container.appendChild(card);
    });
}
