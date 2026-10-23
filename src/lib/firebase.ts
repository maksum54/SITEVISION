import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase hanya dipakai untuk login (Authentication). Data disimpan di Google Sheets
// dan foto di Google Drive lewat Google Apps Script (lihat src/lib/api.ts).
const app = initializeApp({
  apiKey: 'AIzaSyB4SLut2f8tp1lbA2UV2rVsQJC-L2SNTEk',
  authDomain: 'site-survey-4ab21.firebaseapp.com',
  projectId: 'site-survey-4ab21',
  storageBucket: 'site-survey-4ab21.firebasestorage.app',
  messagingSenderId: '433178346301',
  appId: '1:433178346301:web:a0f8b3087f918aac977b54',
})

export const auth = getAuth(app)
