import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { UserService } from './user.service';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class FirebaseMessagingService {
  private messaging!: Messaging;

  constructor(private userService: UserService, private apiService: ApiService) {
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyDm_YESp_Osabapy7DDPVNFRR9R2EYv32I",
        authDomain: "ispeck-finprod.firebaseapp.com",
        projectId: "ispeck-finprod",
        storageBucket: "ispeck-finprod.firebasestorage.app",
        messagingSenderId: "136681038678",
        appId: "1:136681038678:web:272d45a130c965a45d2cf7",
        measurementId: "G-5R6QY29G04"
      };

      const app = initializeApp(firebaseConfig);
      this.messaging = getMessaging(app);

      console.log('[FCM] Firebase initialized and messaging created.');
    } catch (error) {
      console.log('[FCM] Error in constructor while initializing Firebase:', error);
    }
  }

  async requestPermissionAndToken(): Promise<boolean> {
    try {
      try {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          console.log('[FCM] Notifications or service workers not supported.');
          return false;
        }
      } catch (error) {
        console.log('[FCM] Error while checking browser support:', error);
        return false;
      }

      let userId: any;
      try {
        userId = this.userService.getUserId();
        if (!userId) {
          console.log('[FCM] No user ID found.');
          return false;
        }
      } catch (error) {
        console.log('[FCM] Error while fetching userId:', error);
        return false;
      }

      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('[FCM] Permission denied:', permission);
          return false;
        }
      } catch (error) {
        console.log('[FCM] Error while requesting notification permission:', error);
        return false;
      }

      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
        console.log('[FCM] Service worker registered:', registration);
      } catch (error) {
        console.log('[FCM] Error while registering service worker:', error);
        return false;
      }

      let token: string | null;
      try {
        token = await getToken(this.messaging, {
          vapidKey: 'BKHXWnX48DlqiBu6XFOmnSiQKXgzPnIFtl5lj3Lpgtacn4q4JTdmPBSK9uKI6WeBrms-lsJia5vg0dNUr1lgISU',
          serviceWorkerRegistration: registration,
        });

        if (!token) {
          console.log('[FCM] Token is null.');
          return false;
        }

        console.log('[FCM] Token retrieved:', token);
      } catch (error) {
        console.log('[FCM] Error while getting FCM token:', error);
        return false;
      }

      try {
        const response = await fetch(
          `${this.apiService.FutureApiUrl}save_device_fcm_token?user_id=${userId}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token, platform: 'web' }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[FCM] Failed to save token. Status: ${response.status} - ${errorText}`);
          return false;
        }

        console.log('[FCM] Token saved successfully for user:', userId);
      } catch (error) {
        console.log('[FCM] Error while saving token to backend:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.log('[FCM] Unknown error in requestPermissionAndToken():', error);
      return false;
    }
  }

  listenForMessages(callback: (payload: any) => void): void {
    try {
      try {
        console.log('[FCM] messaging instance:', this.messaging);
      } catch (error) {
        console.log('[FCM] Error while logging messaging instance:', error);
      }

      try {
        onMessage(this.messaging, (payload) => {
          try {
            console.log('[FCM] Message received:', payload);
            if (payload && typeof callback === 'function') {
              callback(payload);
            } else {
              console.log('[FCM] Callback is not a function or payload is empty.');
            }
          } catch (error) {
            console.log('[FCM] Error inside onMessage handler:', error);
          }
        });
      } catch (error) {
        console.log('[FCM] Error while setting up onMessage listener:', error);
      }
    } catch (error) {
      console.log('[FCM] Unknown error in listenForMessages():', error);
    }
  }

}
