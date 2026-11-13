/* AQUA buyer-only service worker. No vehicle, bid or user data is cached.
 * Firebase Cloud Messaging handles background notifications for browsers with
 * supported push subscriptions. It does not grant access to Firestore.
 */
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');
firebase.initializeApp({
 apiKey:'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q',
 authDomain:'gen-lang-client-0531247430.firebaseapp.com',
 projectId:'gen-lang-client-0531247430',
 appId:'1:648461582130:web:01a51bd1db2d85c848612b',
 messagingSenderId:'648461582130'
});
firebase.messaging();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
