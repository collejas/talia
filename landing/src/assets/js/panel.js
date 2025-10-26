import { initialiseTheme } from './modules/theme.js';
import { initialiseChat } from './modules/chat.js';
import { initialiseLayoutObservers } from './modules/layout.js';

// Panel reutiliza el gestor de temas y, si el DOM incluye el webchat, lo inicializa.
initialiseTheme();
initialiseChat();
initialiseLayoutObservers();
