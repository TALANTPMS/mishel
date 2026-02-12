// Конфигурация API
// Используем Vercel API route (работает и локально через vercel dev, и на продакшене)
const API_URL = '/api/chat';
const MODEL = 'gpt-4.1-mini';
const MAX_TOKENS = 300;
const MAX_HISTORY = 10; // Сохраняем только 10 последних сообщений

// Элементы DOM
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const sendBtn = document.getElementById('sendBtn');
const chatWindow = document.querySelector('.chat-window');

// История сообщений для контекста
let messageHistory = [];
let systemPrompt = '';

// Загрузка системного промпта
async function loadSystemPrompt() {
    try {
        // Загружаем оба файла параллельно
        const [sysResponse, userResponse] = await Promise.all([
            fetch('prompts/sys-prompt.txt'),
            fetch('prompts/user-prompt')
        ]);
        
        let sysPromptText = '';
        let userPromptText = '';
        
        if (sysResponse.ok) {
            sysPromptText = await sysResponse.text();
        } else {
            console.warn('Не удалось загрузить sys-prompt.txt');
        }
        
        if (userResponse.ok) {
            userPromptText = await userResponse.text();
        } else {
            console.warn('Не удалось загрузить user-prompt');
        }
        
        // Объединяем оба промпта
        if (sysPromptText || userPromptText) {
            systemPrompt = sysPromptText + (sysPromptText && userPromptText ? '\n\n' : '') + userPromptText;
            // Добавляем системное сообщение в историю
            messageHistory.push({ role: 'system', content: systemPrompt });
        } else {
            // Если оба файла не загрузились, используем дефолтный промпт
            console.warn('Не удалось загрузить промпты, используется по умолчанию');
            systemPrompt = 'Ты — Диана, виртуальный AI-консультант. Отвечай дружелюбно и профессионально.';
            messageHistory.push({ role: 'system', content: systemPrompt });
        }
    } catch (error) {
        console.error('Ошибка при загрузке промптов:', error);
        systemPrompt = 'Ты — Диана, виртуальный AI-консультант. Отвечай дружелюбно и профессионально.';
        messageHistory.push({ role: 'system', content: systemPrompt });
    }
}

// Инициализация диалога
async function initializeDialog() {
    const loadingId = addLoadingMessage();
    sendBtn.disabled = true;
    chatInput.disabled = true;
    
    try {
        // Добавляем инициализирующее сообщение пользователя
        messageHistory.push({ role: 'user', content: 'Начни диалог следуя правилам системного промпта' });
        
        // Отправляем запрос к API
        const botResponse = await sendMessageToAPI(messageHistory);
        
        // Удаляем индикатор загрузки
        removeLoadingMessage(loadingId);
        
        // Добавляем ответ бота в чат (с обработкой меток)
        addBotMessage(botResponse);
        
        // Добавляем ответ в историю
        messageHistory.push({ role: 'assistant', content: botResponse });
        
    } catch (error) {
        console.error('Ошибка при инициализации диалога:', error);
        removeLoadingMessage(loadingId);
        addBotMessage('Здравствуйте! Я Диана, ваш AI-консультант. Чем могу помочь?');
    } finally {
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    chatForm.addEventListener('submit', handleSubmit);
    
    // Загружаем системный промпт
    await loadSystemPrompt();
    
    // Инициализируем диалог
    await initializeDialog();
});

// Обработка отправки формы
async function handleSubmit(e) {
    e.preventDefault();
    
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;
    
    // Очищаем поле ввода
    chatInput.value = '';
    
    // Добавляем сообщение пользователя в чат
    addUserMessage(userMessage);
    
    // Добавляем в историю
    messageHistory.push({ role: 'user', content: userMessage });
    
    // Ограничиваем историю до 10 последних сообщений (сохраняя системное сообщение)
    limitMessageHistory();
    
    // Показываем индикатор загрузки
    const loadingId = addLoadingMessage();
    
    // Блокируем кнопку отправки
    sendBtn.disabled = true;
    chatInput.disabled = true;
    
    try {
        // Отправляем запрос к API
        const botResponse = await sendMessageToAPI(messageHistory);
        
        // Удаляем индикатор загрузки
        removeLoadingMessage(loadingId);
        
        // Добавляем ответ бота в чат (с обработкой меток)
        addBotMessage(botResponse);
        
        // Добавляем ответ в историю
        messageHistory.push({ role: 'assistant', content: botResponse });
        
        // Ограничиваем историю снова (сохраняя системное сообщение)
        limitMessageHistory();
        
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        removeLoadingMessage(loadingId);
        addBotMessage('Извините, произошла ошибка. Попробуйте еще раз.');
    } finally {
        // Разблокируем кнопку отправки
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// Отправка сообщения к API через Vercel Serverless Function
async function sendMessageToAPI(history) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: MODEL,
            messages: history,
            max_tokens: MAX_TOKENS,
            temperature: 0.7
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// Ограничение истории сообщений
function limitMessageHistory() {
    if (messageHistory.length > MAX_HISTORY * 2 + 1) {
        const systemMsg = messageHistory[0];
        const recentMessages = messageHistory.slice(-MAX_HISTORY * 2);
        messageHistory = [systemMsg, ...recentMessages];
    }
}

// Универсальная функция для отправки запроса и обработки ответа бота
async function sendAndProcessBotResponse() {
    const loadingId = addLoadingMessage();
    sendBtn.disabled = true;
    chatInput.disabled = true;
    
    try {
        const botResponse = await sendMessageToAPI(messageHistory);
        removeLoadingMessage(loadingId);
        
        // Добавляем ответ бота в чат (с обработкой меток)
        addBotMessage(botResponse);
        
        // Добавляем ответ в историю
        messageHistory.push({ role: 'assistant', content: botResponse });
        
        // Ограничиваем историю
        limitMessageHistory();
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        removeLoadingMessage(loadingId);
        addBotMessage('Извините, произошла ошибка. Попробуйте еще раз.');
    } finally {
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// Добавление сообщения пользователя
function addUserMessage(text) {
    const messageDiv = createMessageElement('user', text);
    chatMessages.appendChild(messageDiv);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Добавление сообщения бота
function addBotMessage(text) {
    // Обрабатываем метки в тексте
    const processedText = processBotMessage(text);
    
    // Если есть метки, обрабатываем их
    if (processedText.hasMarkers) {
        // Добавляем текстовую часть без меток
        if (processedText.textParts.length > 0) {
            processedText.textParts.forEach(part => {
                if (part.trim()) {
                    const messageDiv = createMessageElement('bot', part);
                    chatMessages.appendChild(messageDiv);
                }
            });
        }
        
        // Обрабатываем метки
        processedText.markers.forEach(marker => {
            handleMarker(marker);
        });
    } else {
        // Обычное сообщение без меток
        const messageDiv = createMessageElement('bot', processedText.textParts[0] || text);
        chatMessages.appendChild(messageDiv);
    }
    
    adjustChatWindowHeight();
    scrollToBottom();
}

// Обработка сообщения бота и извлечение меток
function processBotMessage(text) {
    const markers = [];
    const textParts = [];
    let currentText = text;
    
    // Ищем метку BUTTON с опциями
    const buttonPattern = /\[BUTTON:\s*([^\]]+)\]/g;
    const buttonMatches = [];
    let buttonMatch;
    while ((buttonMatch = buttonPattern.exec(currentText)) !== null) {
        const options = buttonMatch[1].split('|').map(opt => opt.trim()).filter(opt => opt);
        markers.push({ type: 'BUTTON', options: options });
        buttonMatches.push(buttonMatch[0]);
    }
    // Удаляем метки BUTTON из текста
    buttonMatches.forEach(match => {
        currentText = currentText.replace(match, '');
    });
    
    // Ищем остальные метки
    const markerPatterns = [
        { pattern: /\[START_QUESTIONS\]/g, type: 'START_QUESTIONS' },
        { pattern: /\[MESSAGE_DIVIDER\]/g, type: 'MESSAGE_DIVIDER' },
        { pattern: /\[ASK_MESSENGER\]/g, type: 'ASK_MESSENGER' },
        { pattern: /\[NAME_INPUT\]/g, type: 'NAME_INPUT' },
        { pattern: /\[PHONE_INPUT\]/g, type: 'PHONE_INPUT' },
        { pattern: /\[REQUEST_ACCEPTED\]/g, type: 'REQUEST_ACCEPTED' }
    ];
    
    // Удаляем метки из текста и сохраняем их
    markerPatterns.forEach(({ pattern, type }) => {
        if (pattern.test(currentText)) {
            markers.push({ type: type });
            currentText = currentText.replace(pattern, '');
        }
    });
    
    // Разделяем текст по меткам MESSAGE_DIVIDER (если они были)
    const hasMessageDivider = markers.some(m => (typeof m === 'string' ? m : m.type) === 'MESSAGE_DIVIDER');
    if (hasMessageDivider) {
        // Разделяем на абзацы или предложения
        const parts = currentText.split(/\n\n+/).filter(p => p.trim());
        if (parts.length > 0) {
            textParts.push(...parts);
        } else {
            textParts.push(currentText);
        }
    } else {
        textParts.push(currentText.trim());
    }
    
    return {
        textParts: textParts.filter(p => p.trim()),
        markers: markers,
        hasMarkers: markers.length > 0
    };
}

// Обработка меток
function handleMarker(marker) {
    const markerType = typeof marker === 'string' ? marker : marker.type;
    
    switch (markerType) {
        case 'START_QUESTIONS':
            showStartQuestions();
            break;
        case 'BUTTON':
            showButtons(marker.options);
            break;
        case 'ASK_MESSENGER':
            showMessengerOptions();
            break;
        case 'NAME_INPUT':
            showNameInputForm();
            break;
        case 'PHONE_INPUT':
            showPhoneInputForm();
            break;
        case 'REQUEST_ACCEPTED':
            showRequestAccepted();
            break;
    }
}

// Показать стартовые вопросы
function showStartQuestions() {
    const questionsContainer = document.createElement('div');
    questionsContainer.className = 'start-questions-container';
    
    const questions = [
        'Якорный вопрос',
        'Якорный вопрос',
        'Якорный вопрос',
        'Хочу задать свой вопрос'
    ];
    
    questions.forEach((question, index) => {
        const questionBtn = document.createElement('button');
        questionBtn.className = 'start-question-btn';
        questionBtn.textContent = question;
        questionBtn.addEventListener('click', () => {
            // Добавляем выбранный вопрос как сообщение пользователя
            addUserMessage(question);
            messageHistory.push({ role: 'user', content: question });
            
            // Удаляем контейнер с вопросами и текстом
            questionsContainer.remove();
            
            // Отправляем запрос к API
            handleQuestionSelection();
        });
        questionsContainer.appendChild(questionBtn);
    });
    
    // Добавляем текст про якорные вопросы после кнопок
    const anchorText = document.createElement('p');
    anchorText.className = 'anchor-text-small';
    anchorText.textContent = '*Для чего нужны якорные вопросы? Многие пользователи не знают, с чего начать диалог: о чём спросить и как правильно сформулировать свой вопрос. Чтобы упростить старт общения, мы заранее подготавливаем якорные вопросы — те, которые компания получает чаще всего или которые с высокой вероятностью могут возникнуть у пользователя. Эти вопросы помогают запустить диалог и начать общение. Далее пользователь вовлекается, раскрывается и переходит к своим индивидуальным запросам — для этого предусмотрена кнопка «Задать свой вопрос».';
    questionsContainer.appendChild(anchorText);
    
    chatMessages.appendChild(questionsContainer);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Обработка выбранного вопроса
async function handleQuestionSelection() {
    await sendAndProcessBotResponse();
}

// Показать кнопки с опциями
function showButtons(options) {
    if (!options || options.length === 0) return;
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'buttons-container';
    
    options.forEach((option) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option;
        button.addEventListener('click', () => {
            // Добавляем выбранную опцию как сообщение пользователя
            addUserMessage(option);
            messageHistory.push({ role: 'user', content: option });
            
            // Удаляем контейнер с кнопками
            buttonsContainer.remove();
            
            // Отправляем запрос к API
            handleButtonSelection();
        });
        buttonsContainer.appendChild(button);
    });
    
    chatMessages.appendChild(buttonsContainer);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Обработка выбранной опции из кнопок
async function handleButtonSelection() {
    await sendAndProcessBotResponse();
}

// Показать варианты мессенджеров
function showMessengerOptions() {
    const messengersContainer = document.createElement('div');
    messengersContainer.className = 'messengers-container';
    
    const messengers = ['WhatsApp', 'Telegram', 'Max'];
    
    messengers.forEach((messenger) => {
        const button = document.createElement('button');
        button.className = 'messenger-button';
        button.textContent = messenger;
        button.addEventListener('click', () => {
            // Добавляем выбранный мессенджер как сообщение пользователя
            addUserMessage(messenger);
            messageHistory.push({ role: 'user', content: messenger });
            
            // Удаляем контейнер с кнопками
            messengersContainer.remove();
            
            // Отправляем запрос к API
            handleMessengerSelection();
        });
        messengersContainer.appendChild(button);
    });
    
    chatMessages.appendChild(messengersContainer);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Обработка выбранного мессенджера
async function handleMessengerSelection() {
    await sendAndProcessBotResponse();
}

// Показать форму ввода имени
function showNameInputForm() {
    const formContainer = document.createElement('div');
    formContainer.className = 'input-form-container';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'name-input';
    input.placeholder = 'Введите ваше имя';
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'form-submit-btn';
    submitBtn.textContent = 'Отправить';
    
    submitBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (name) {
            // Добавляем имя как сообщение пользователя
            addUserMessage(`Имя: ${name}`);
            messageHistory.push({ role: 'user', content: `Имя: ${name}` });
            
            // Сохраняем имя для дальнейшего использования
            window.userName = name;
            
            formContainer.remove();
            
            // Продолжаем диалог
            continueAfterNameInput();
        }
    });
    
    formContainer.appendChild(input);
    formContainer.appendChild(submitBtn);
    chatMessages.appendChild(formContainer);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Продолжение после ввода имени
async function continueAfterNameInput() {
    await sendAndProcessBotResponse();
}

// Показать форму ввода телефона
function showPhoneInputForm() {
    const formContainer = document.createElement('div');
    formContainer.className = 'input-form-container';
    
    const input = document.createElement('input');
    input.type = 'tel';
    input.className = 'phone-input';
    input.placeholder = 'Ваш телефон';
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'form-submit-btn';
    submitBtn.textContent = 'Отправить';
    
    submitBtn.addEventListener('click', () => {
        const phone = input.value.trim();
        
        if (phone) {
            addUserMessage(`Телефон: ${phone}`);
            messageHistory.push({ role: 'user', content: `Телефон: ${phone}` });
            window.userPhone = phone;
            
            formContainer.remove();
            continueAfterPhoneInput();
        }
    });
    
    formContainer.appendChild(input);
    formContainer.appendChild(submitBtn);
    chatMessages.appendChild(formContainer);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Продолжение после ввода телефона
async function continueAfterPhoneInput() {
    await sendAndProcessBotResponse();
}

// Показать плашку о принятии заявки
function showRequestAccepted() {
    const acceptedDiv = document.createElement('div');
    acceptedDiv.className = 'request-accepted';
    acceptedDiv.innerHTML = `
        <div class="accepted-content">
            <strong>✓ Заявка принята!</strong>
            <p>Ваша заявка успешно отправлена. Мы свяжемся с вами в ближайшее время.</p>
        </div>
    `;
    chatMessages.appendChild(acceptedDiv);
    adjustChatWindowHeight();
    scrollToBottom();
}

// Создание элемента сообщения
function createMessageElement(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();
    
    contentDiv.appendChild(timeDiv);
    messageDiv.appendChild(contentDiv);
    
    return messageDiv;
}

// Добавление индикатора загрузки
function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-bot';
    loadingDiv.id = 'loading-message';
    
    const loadingContent = document.createElement('div');
    loadingContent.className = 'loading';
    
    const dots = document.createElement('div');
    dots.className = 'loading-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    
    loadingContent.appendChild(dots);
    loadingDiv.appendChild(loadingContent);
    chatMessages.appendChild(loadingDiv);
    
    adjustChatWindowHeight();
    scrollToBottom();
    
    return 'loading-message';
}

// Удаление индикатора загрузки
function removeLoadingMessage(id) {
    const loadingElement = document.getElementById(id);
    if (loadingElement) {
        loadingElement.remove();
    }
}

// Получение текущего времени
function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Прокрутка вниз
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Автоматическое увеличение высоты окна чата
function adjustChatWindowHeight() {
    const messagesHeight = chatMessages.scrollHeight;
    const inputAreaHeight = document.querySelector('.chat-input-area').offsetHeight;
    const avatarHeight = document.querySelector('.chat-avatar').offsetHeight;
    
    // Минимальная высота окна
    const minHeight = 400;
    
    // Вычисляем необходимую высоту
    const requiredHeight = messagesHeight + inputAreaHeight;
    
    // Если контент больше минимальной высоты, увеличиваем окно
    if (requiredHeight > minHeight) {
        chatWindow.style.height = 'auto';
        chatWindow.style.minHeight = `${Math.max(requiredHeight, minHeight)}px`;
    } else {
        chatWindow.style.minHeight = `${minHeight}px`;
    }
    
    // Прокручиваем вниз после изменения высоты
    setTimeout(() => {
        scrollToBottom();
    }, 10);
}

