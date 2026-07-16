

importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDm_YESp_Osabapy7DDPVNFRR9R2EYv32I",
  authDomain: "ispeck-finprod.firebaseapp.com",
  projectId: "ispeck-finprod",
  storageBucket: "ispeck-finprod.appspot.com",
  messagingSenderId: "136681038678",
  appId: "1:136681038678:web:272d45a130c965a45d2cf7",
  measurementId: "G-5R6QY29G04"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // const notificationTitle = payload.notification?.title ?? 'Notification';
  // const notificationOptions = {
  //   body: payload.notification?.body,
  //   icon: '/firebase-logo.png'
  // };

  // self.registration.showNotification(notificationTitle, notificationOptions);
});


