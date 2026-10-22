import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const appEl = document.getElementById('app');

if (appEl) {
  mount(App, { target: appEl });
} else {
  console.error('[Energía Vital] No se encontró el elemento #app en el DOM');
}