import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import { applyPreferences, loadPreferences } from './blueprint-shell.js';

applyPreferences(loadPreferences());
mount(App, { target: document.getElementById('app') });
