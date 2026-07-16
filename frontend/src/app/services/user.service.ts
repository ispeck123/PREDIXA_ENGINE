// src/app/services/user.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  getUserId(): string | null {
    return localStorage.getItem('UserId');
  }

  setUserId(id: string) {
    localStorage.setItem('UserId', id);
  }

  clearUserId() {
    localStorage.removeItem('UserId');
  }
}
