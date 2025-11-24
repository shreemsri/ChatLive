// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCKcAMCjrmEFUzTgAL3yRWD832BdPdHP8k",
  authDomain: "chat-app-61d10.firebaseapp.com",
  projectId: "chat-app-61d10",
  storageBucket: "chat-app-61d10.firebasestorage.app",
  messagingSenderId: "735989661186",
  appId: "1:735989661186:web:4b80eb1185fd2943eb711b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 👉 Add these lines
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();