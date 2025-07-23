// auth.js - Đăng nhập/Đăng ký cho Zitthenkne
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const loginLink = document.getElementById('login-link');
const authMessage = document.getElementById('auth-message');

showRegister.onclick = e => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  loginLink.classList.remove('hidden');
  authMessage.textContent = '';
};
showLogin.onclick = e => {
  e.preventDefault();
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  loginLink.classList.add('hidden');
  authMessage.textContent = '';
};

loginForm.onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  authMessage.textContent = 'Đang đăng nhập...';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authMessage.textContent = 'Đăng nhập thành công! Đang chuyển hướng...';
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (err) {
    authMessage.textContent = 'Lỗi: ' + (err.message || 'Không xác định');
  }
};

registerForm.onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  authMessage.textContent = 'Đang đăng ký...';
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    // Lưu thông tin user vào Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      displayName: name,
      email: email,
      avatarBgColor: '#D8BFD8',
      avatarAnimal: '🐱'
    });
    authMessage.textContent = 'Đăng ký thành công! Đang chuyển hướng...';
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (err) {
    authMessage.textContent = 'Lỗi: ' + (err.message || 'Không xác định');
  }
};
