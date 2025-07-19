// Função para atualizar o relógio em tempo real
function updateClock() {
    const now = new Date();
    const timeElement = document.querySelector('.time');
    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString('pt-BR');
    }
}

// Função para animar as notícias com scroll automático
function animateNews() {
    const newsScroll = document.querySelector('.news-scroll');
    if (newsScroll) {
        let scrollPosition = 0;
        const scrollSpeed = 1;
        
        setInterval(() => {
            scrollPosition += scrollSpeed;
            if (scrollPosition >= newsScroll.scrollHeight - newsScroll.clientHeight) {
                scrollPosition = 0;
            }
            newsScroll.scrollTop = scrollPosition;
        }, 50);
    }
}

// Função para adicionar efeitos de hover nos programas
function addProgramEffects() {
    const programItems = document.querySelectorAll('.program-item');
    
    programItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.05)';
            this.style.boxShadow = '0 12px 24px rgba(0,0,0,0.5)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        });
    });
}

// Função para adicionar efeitos de clique nos botões
function addButtonEffects() {
    const buttons = document.querySelectorAll('.main-nav a, .side-nav a');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Criar efeito de ripple
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
}

// Função para simular carregamento de notícias em tempo real
function simulateLiveNews() {
    const newsScroll = document.querySelector('.news-scroll');
    if (!newsScroll) return;
    
    const newsItems = [
        'Nova tecnologia é apresentada no Vale do Paraíba',
        'Prefeitura anuncia parceria com empresas locais',
        'Evento cultural atrai milhares de visitantes',
        'Rede Vanguarda recebe prêmio de jornalismo',
        'Cobertura especial sobre educação na região',
        'Denúncias de irregularidades são investigadas',
        'Programa especial sobre meio ambiente',
        'Tecnologia e inovação movimentam economia'
    ];
    
    setInterval(() => {
        const now = new Date();
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        const randomNews = newsItems[Math.floor(Math.random() * newsItems.length)];
        
        const newsItem = document.createElement('div');
        newsItem.className = 'news-item';
        newsItem.innerHTML = `
            <span class="news-time">${time}</span>
            <span class="news-text">${randomNews}</span>
        `;
        
        newsScroll.appendChild(newsItem);
        
        // Remover notícias antigas se houver muitas
        const allNews = newsScroll.querySelectorAll('.news-item');
        if (allNews.length > 10) {
            allNews[0].remove();
        }
    }, 30000); // Adicionar nova notícia a cada 30 segundos
}

// Função para adicionar efeitos de partículas no fundo
function addParticleEffects() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    // Criar partículas flutuantes
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: fixed;
            width: 2px;
            height: 2px;
            background: rgba(231, 76, 60, 0.3);
            border-radius: 50%;
            pointer-events: none;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: float ${3 + Math.random() * 4}s infinite ease-in-out;
        `;
        document.body.appendChild(particle);
    }
}

// Função para inicializar todos os efeitos
function initializeEffects() {
    updateClock();
    setInterval(updateClock, 1000);
    
    addProgramEffects();
    addButtonEffects();
    addParticleEffects();
    
    // Iniciar animação de notícias após um delay
    setTimeout(() => {
        animateNews();
        simulateLiveNews();
    }, 2000);
}

// Adicionar CSS para animações
const style = document.createElement('style');
style.textContent = `
    @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-20px) rotate(180deg); }
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .particle {
        z-index: -1;
    }
`;
document.head.appendChild(style);

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    initializeEffects();
    
    // Adicionar efeito de loading
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.innerHTML = `
        <div class="loader-content">
            <h3>Rede Vanguarda</h3>
            <p>Carregando...</p>
        </div>
    `;
    loader.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        transition: opacity 0.5s ease;
    `;
    
    document.body.appendChild(loader);
    
    // Remover loader após 2 segundos
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.remove();
        }, 500);
    }, 2000);
});

// Função para adicionar efeitos de som (opcional)
function addSoundEffects() {
    const buttons = document.querySelectorAll('.main-nav a, .side-nav a');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Simular som de clique (sem áudio real para evitar problemas)
            console.log('Botão clicado:', this.textContent);
        });
    });
}

// Adicionar efeitos de som
document.addEventListener('DOMContentLoaded', addSoundEffects);
