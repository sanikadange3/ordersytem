import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, updateProfile } from "./firebasec.js";

const DOM = {
    form: document.getElementById('authForm'),
    btn: document.getElementById('authBtn'),
    toggle: document.getElementById('toggleAuth'),
    title: document.getElementById('authTitle'),
    registerFields: document.getElementById('registerFields'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    name: document.getElementById('name')
};

let isLogin = true;

const toggleMode = () => {
    isLogin = !isLogin;
    DOM.title.textContent = isLogin ? 'Sign In' : 'Register';
    DOM.btn.textContent = isLogin ? 'Enter Dashboard' : 'Create Account';
    DOM.toggle.textContent = isLogin ? 'Need an account? Register here' : 'Already have an account? Login here';
    DOM.registerFields.style.display = isLogin ? 'none' : 'block';
    DOM.name.required = !isLogin;
};

DOM.toggle.addEventListener('click', toggleMode);

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email === 'admin@orderease.com') {
            window.location.href = "admin.html";
        } else {
            window.location.href = "user.html";
        }
    }
});

DOM.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = DOM.email.value;
    const password = DOM.password.value;
    const name = DOM.name.value;

    DOM.btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    try {
        if (isLogin) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            if (name) {
                await updateProfile(result.user || auth.currentUser, { displayName: name });
                localStorage.setItem('userName', name);
            }
        }
        if (email === 'admin@orderease.com') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'user.html';
        }
    } catch (err) {
        alert(err.message || "Authentication failed");
        DOM.btn.textContent = isLogin ? 'Enter Dashboard' : 'Create Account';
    }
});
