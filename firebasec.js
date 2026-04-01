// Firebase dynamic auth helper with local fallback.
// To enable real Firebase authentication, paste your Firebase config values below.

const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

const useFirebase = !!firebaseConfig.apiKey && !!firebaseConfig.authDomain && !!firebaseConfig.projectId;
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let firebaseAuthModule = null;
let firebaseFirestoreModule = null;

const STORAGE_ORDERS = 'gourmetflow_orders';
const STORAGE_USERS = 'gourmetflow_users';
const STORAGE_AUTH = 'gourmetflow_session';
const STORAGE_MENU = 'orderease_menu';

// Helper: Get data from local storage
const getData = (key) => JSON.parse(localStorage.getItem(key) || '[]');
const setData = (key, val) => localStorage.setItem(key, JSON.stringify(val));

const applyQuery = (items, q) => {
    if (!q || typeof q === 'string') return items;
    let result = [...items];

    const whereConstraints = (q.constraints || []).filter(c => c.type === 'where');
    const orderConstraints = (q.constraints || []).filter(c => c.type === 'orderBy');

    whereConstraints.forEach(constraint => {
        result = result.filter(item => {
            const fieldValue = item[constraint.field];
            const compareValue = constraint.val;
            switch (constraint.op) {
                case '==': return fieldValue === compareValue;
                case '!=': return fieldValue !== compareValue;
                case '<': return fieldValue < compareValue;
                case '<=': return fieldValue <= compareValue;
                case '>': return fieldValue > compareValue;
                case '>=': return fieldValue >= compareValue;
                default: return true;
            }
        });
    });

    orderConstraints.forEach(constraint => {
        result.sort((a, b) => {
            const aValue = a[constraint.field];
            const bValue = b[constraint.field];
            if (aValue === bValue) return 0;
            const direction = constraint.dir === 'desc' ? -1 : 1;
            return aValue > bValue ? direction : -direction;
        });
    });

    return result;
};

const buildSnapshot = (items) => ({
    empty: items.length === 0,
    forEach: (cb) => items.forEach(d => cb({ id: d.id, data: () => ({
        ...d,
        timestamp: d.timestamp ? { toMillis: () => typeof d.timestamp === 'number' ? d.timestamp : (d.timestamp.ms || Date.now()) } : { toMillis: () => Date.now() }
    }) }))
});

const seedInitialMenu = () => {
    if (getData(STORAGE_MENU).length === 0) {
        const initialMenu = [
            { id: 'm1', name: 'Truffle Fries', price: 12, category: 'Starters', description: 'Crispy golden fries with truffle oil and parmesan.', image: 'https://images.unsplash.com/photo-1573082801974-bc7111c7d6b0?q=80&w=200&h=200&auto=format&fit=crop' },
            { id: 'm2', name: 'Signature Burger', price: 18, category: 'Main Course', description: 'Double wagyu beef patty with secret sauce.', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=200&h=200&auto=format&fit=crop' },
            { id: 'm3', name: 'Iced Matcha Latte', price: 7, category: 'Beverages', description: 'Ceremonial grade matcha with oat milk.', image: 'https://images.unsplash.com/photo-1515823149273-dfd7af5509e7?q=80&w=200&h=200&auto=format&fit=crop' }
        ];
        setData(STORAGE_MENU, initialMenu);
    }
};

const seedDefaultUsers = () => {
    const users = getData(STORAGE_USERS);
    if (!users.some(u => u.email === 'admin@orderease.com')) {
        users.push({ uid: 'admin_1', email: 'admin@orderease.com', password: 'admin123', displayName: 'Administrator' });
        setData(STORAGE_USERS, users);
    }
};

seedDefaultUsers();

const listeners = [];
const notifyListeners = () => listeners.forEach(l => l());

const initFirebase = async () => {
    if (!useFirebase) return;
    if (firebaseApp) return;

    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js')
    ]);

    firebaseAuthModule = authModule;
    firebaseFirestoreModule = firestoreModule;
    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = firebaseAuthModule.getAuth(firebaseApp);
    firestoreDb = firebaseFirestoreModule.getFirestore(firebaseApp);
};

if (useFirebase) {
    await initFirebase();
}

export const db = useFirebase ? firestoreDb : {};
export const auth = useFirebase ? firebaseAuth : {
    get currentUser() {
        return JSON.parse(localStorage.getItem(STORAGE_AUTH) || 'null');
    }
};

export const collection = (dbRef, name) => {
    if (useFirebase) return firebaseFirestoreModule.collection(dbRef, name);
    return name;
};

export const doc = (dbRef, name, id) => {
    if (useFirebase) return firebaseFirestoreModule.doc(dbRef, name, id);
    return { name, id };
};

export const Timestamp = useFirebase ? firebaseFirestoreModule.Timestamp : {
    now: () => ({ toMillis: () => Date.now(), ms: Date.now() }),
    fromMillis: (ms) => ({ toMillis: () => ms, ms })
};

export const getDocs = async (qOrColl) => {
    if (useFirebase) {
        return firebaseFirestoreModule.getDocs(qOrColl);
    }

    const collName = typeof qOrColl === 'string' ? qOrColl : qOrColl.collName;
    const items = getData(collName === 'menu' ? STORAGE_MENU : STORAGE_ORDERS);
    const filtered = typeof qOrColl === 'string' ? items : applyQuery(items, qOrColl);
    return buildSnapshot(filtered);
};

export const addDoc = async (qOrColl, data) => {
    if (useFirebase) {
        return firebaseFirestoreModule.addDoc(qOrColl, data);
    }

    const collName = typeof qOrColl === 'string' ? qOrColl : qOrColl.collName;
    const key = collName === 'menu' ? STORAGE_MENU : STORAGE_ORDERS;
    const items = getData(key);

    let rawTs = Date.now();
    if (data.timestamp && data.timestamp.toMillis) rawTs = data.timestamp.toMillis();

    const newItem = {
        id: (collName === 'menu' ? 'm_' : 'ord_') + Math.random().toString(36).substr(2, 9),
        ...data,
        timestamp: rawTs
    };
    items.push(newItem);
    setData(key, items);
    notifyListeners();
    return { id: newItem.id };
};

export const updateDoc = async (docRef, data) => {
    if (useFirebase) {
        return firebaseFirestoreModule.updateDoc(docRef, data);
    }

    const key = docRef.name === 'menu' ? STORAGE_MENU : STORAGE_ORDERS;
    const items = getData(key);
    const index = items.findIndex(i => i.id === docRef.id);
    if (index !== -1) {
        if (data.timestamp && data.timestamp.toMillis) data.timestamp = data.timestamp.toMillis();
        items[index] = { ...items[index], ...data };
        setData(key, items);
        notifyListeners();
    }
};

export const deleteDoc = async (docRef) => {
    if (useFirebase) {
        return firebaseFirestoreModule.deleteDoc(docRef);
    }

    const key = docRef.name === 'menu' ? STORAGE_MENU : STORAGE_ORDERS;
    const items = getData(key).filter(i => i.id !== docRef.id);
    setData(key, items);
    notifyListeners();
};

export const query = (collName, ...constraints) => {
    if (useFirebase) return firebaseFirestoreModule.query(collName, ...constraints);
    return { collName, constraints };
};

export const orderBy = (field, dir) => {
    if (useFirebase) return firebaseFirestoreModule.orderBy(field, dir);
    return { type: 'orderBy', field, dir };
};

export const where = (field, op, val) => {
    if (useFirebase) return firebaseFirestoreModule.where(field, op, val);
    return { type: 'where', field, op, val };
};

export const onSnapshot = (q, callback) => {
    if (useFirebase) {
        return firebaseFirestoreModule.onSnapshot(q, callback);
    }

    const runQuery = () => {
        const storageKey = q.collName === 'menu' ? STORAGE_MENU : STORAGE_ORDERS;
        const items = getData(storageKey);
        const filtered = applyQuery(items, q).map(i => ({
            id: i.id,
            data: () => ({
                ...i,
                timestamp: { toMillis: () => typeof i.timestamp === 'number' ? i.timestamp : (i.timestamp && i.timestamp.ms ? i.timestamp.ms : Date.now()) }
            })
        }));

        const snapshot = { forEach: (cb) => filtered.forEach(cb) };
        callback(snapshot);
    };

    listeners.push(runQuery);
    runQuery();
    return () => { /* unsubscribe */ };
};

export const signInWithEmailAndPassword = async (authObj, email, password) => {
    if (useFirebase) {
        return firebaseAuthModule.signInWithEmailAndPassword(firebaseAuth, email, password);
    }

    const users = getData(STORAGE_USERS);
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) throw { code: 'auth/invalid-credential', message: 'Invalid Login' };
    setData(STORAGE_AUTH, user);
    notifyListeners();
    return { user };
};

export const createUserWithEmailAndPassword = async (authObj, email, password) => {
    if (useFirebase) {
        return firebaseAuthModule.createUserWithEmailAndPassword(firebaseAuth, email, password);
    }

    const users = getData(STORAGE_USERS);
    if (users.find(u => u.email === email)) throw { message: 'User already exists' };
    const newUser = { uid: email === 'admin@orderease.com' ? 'admin_1' : 'u_' + Date.now(), email, password, displayName: '' };
    users.push(newUser);
    setData(STORAGE_USERS, users);
    setData(STORAGE_AUTH, newUser);
    notifyListeners();
    return { user: newUser };
};

export const updateProfile = async (user, data) => {
    if (useFirebase) {
        return firebaseAuthModule.updateProfile(user, data);
    }

    const users = getData(STORAGE_USERS);
    const index = users.findIndex(u => u.uid === user?.uid);
    if (index !== -1) {
        users[index] = { ...users[index], ...data };
        setData(STORAGE_USERS, users);
        if (auth.currentUser?.uid === user.uid) {
            setData(STORAGE_AUTH, users[index]);
            notifyListeners();
        }
    }
};

export const onAuthStateChanged = (authObj, callback) => {
    if (useFirebase) {
        return firebaseAuthModule.onAuthStateChanged(firebaseAuth, callback);
    }

    const check = () => callback(JSON.parse(localStorage.getItem(STORAGE_AUTH) || 'null'));
    listeners.push(check);
    check();
};

export const signOut = async (authObj) => {
    if (useFirebase) {
        await firebaseAuthModule.signOut(firebaseAuth);
        window.location.href = 'index.html';
        return;
    }

    localStorage.removeItem(STORAGE_AUTH);
    notifyListeners();
    window.location.href = 'index.html';
};

seedInitialMenu();