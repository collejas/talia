import { TALIA_INTRO, chatResponses, fallbackMessage } from '../../data/chat-responses.js';

const themeSelect = document.getElementById('theme-select');
const body = document.body;
const THEME_STORAGE_KEY = 'talia-theme-preference';
const THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];

function applyTheme(theme) {
  const selected = THEMES.includes(theme) ? theme : THEMES[0];
  body.classList.remove(...THEMES);
  body.classList.add(selected);
  if (themeSelect) {
    themeSelect.value = selected;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, selected);
  } catch (error) {
    console.warn('No se pudo guardar la preferencia de tema.', error);
  }
}

function initialiseTheme() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo leer la preferencia de tema.', error);
  }
  const defaultTheme =
    body.className.split(' ').find((cls) => THEMES.includes(cls)) || THEMES[0];
  applyTheme(storedTheme || defaultTheme);
}

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });
}

initialiseTheme();

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const currentYear = document.getElementById('current-year');

function appendMessage(text, sender = 'bot') {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-message ${sender}`;

  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = sender === 'bot' ? '🤖' : '🧑';

  const content = document.createElement('p');
  content.textContent = text;

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function getTalIAResponse(rawInput) {
  const input = rawInput.toLowerCase();

  const matched = chatResponses.find(({ keywords }) =>
    keywords.some((keyword) => input.includes(keyword))
  );

  return matched?.message ?? fallbackMessage;
}

function handleSubmit(event) {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage(message, 'user');
  chatInput.value = '';
  chatInput.focus();

  const thinking = document.createElement('div');
  thinking.className = 'chat-message bot';
  thinking.innerHTML = '<span class="avatar">🤖</span><p>TalIA está pensando…</p>';
  chatMessages.appendChild(thinking);
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });

  setTimeout(() => {
    thinking.remove();
    appendMessage(getTalIAResponse(message));
  }, 600 + Math.random() * 400);
}

if (chatMessages) {
  appendMessage(TALIA_INTRO);
}

if (chatForm) {
  chatForm.addEventListener('submit', handleSubmit);
}

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}
