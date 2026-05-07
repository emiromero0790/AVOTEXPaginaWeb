document.addEventListener('DOMContentLoaded', function() {
    const updateLoginUI = () => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const loginButtons = document.querySelector('.login-buttons');
        const userProfile = document.querySelector('.user-profile');
        
        if (user.isLoggedIn) {
            if (loginButtons) {
                loginButtons.style.display = 'none';
                const navList = document.querySelector('.nav-list');
                const userProfileHTML = `
                    <div class="user-profile">
                        <span class="user-name">👤 ${user.nombre}</span>
                        <button class="logout-btn">Cerrar sesión</button>
                    </div>
                `;
                navList.insertAdjacentHTML('beforeend', userProfileHTML);
                
                document.querySelector('.logout-btn').addEventListener('click', () => {
                    localStorage.removeItem('user');
                    location.reload();
                });
            }
        } else {
            if (loginButtons) {
                loginButtons.style.display = 'flex';
            }
            if (userProfile) {
                userProfile.remove();
            }
        }
    };

    updateLoginUI();


    const loginBtn = document.querySelector('.submenu-login-btn');
    const registerBtn = document.querySelector('.submenu-registration-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            window.location.href = 'registration.html';
        });
    }

    const carousel = document.querySelector('.carousel');
    const slides = document.querySelectorAll('.carousel-slide');
    const prevButton = document.querySelector('.prev');
    const nextButton = document.querySelector('.next');
    const dots = document.querySelectorAll('.dot');
    
    if (carousel && slides.length > 0) {
        let currentSlide = 0;
        const slideCount = slides.length;
        
        function updateCarousel() {
            carousel.style.transform = `translateX(-${currentSlide * 33.333}%)`;
            dots.forEach(dot => dot.classList.remove('active'));
            dots[currentSlide].classList.add('active');
        }
        
        function nextSlide() {
            currentSlide = (currentSlide + 1) % slideCount;
            updateCarousel();
        }
        
        function prevSlide() {
            currentSlide = (currentSlide - 1 + slideCount) % slideCount;
            updateCarousel();
        }
        
        if (prevButton && nextButton) {
            nextButton.addEventListener('click', nextSlide);
            prevButton.addEventListener('click', prevSlide);
            
            dots.forEach((dot, index) => {
                dot.addEventListener('click', () => {
                    currentSlide = index;
                    updateCarousel();
                });
            });
            
            setInterval(nextSlide, 5000);
        }
    }

    const showcaseTrack = document.querySelector('.carousel-container2 .carousel-track');
    const showcaseSlides = document.querySelectorAll('.carousel-container2 .carousel-slide2');
    const showcaseNext = document.querySelector('.next2');
    const showcasePrev = document.querySelector('.prev2');
    const showcaseDotsContainer = document.querySelector('.carousel-dots2');

    if (showcaseTrack && showcaseSlides.length > 0) {
        let currentShowcaseIndex = 0;

        showcaseSlides.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToShowcaseSlide(index));
            showcaseDotsContainer.appendChild(dot);
        });

        const showcaseDots = document.querySelectorAll('.carousel-dots2 .dot');

        function updateShowcaseDots() {
            showcaseDots.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentShowcaseIndex);
            });
        }

        function goToShowcaseSlide(index) {
            currentShowcaseIndex = index;
            showcaseTrack.style.transform = `translateX(-${currentShowcaseIndex * 100}%)`;
            updateShowcaseDots();
        }

        function nextShowcaseSlide() {
            currentShowcaseIndex = (currentShowcaseIndex + 1) % showcaseSlides.length;
            goToShowcaseSlide(currentShowcaseIndex);
        }

        function prevShowcaseSlide() {
            currentShowcaseIndex = (currentShowcaseIndex - 1 + showcaseSlides.length) % showcaseSlides.length;
            goToShowcaseSlide(currentShowcaseIndex);
        }

        if (showcaseNext) showcaseNext.addEventListener('click', nextShowcaseSlide);
        if (showcasePrev) showcasePrev.addEventListener('click', prevShowcaseSlide);

        setInterval(nextShowcaseSlide, 9000);
    }
});

// Smooth scroll para los enlaces de navegación
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Header scroll effect
let lastScroll = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    } else {
        header.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
    }
    
    lastScroll = currentScroll;
});

// Animación de entrada para elementos cuando entran en viewport
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observar elementos que deben animarse
document.querySelectorAll('.service-card, .project-showcase, .team-member, .testimonial-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// Contador animado para estadísticas
function animateCounter(element, target) {
    const duration = 2000;
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target + (element.dataset.suffix || '');
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current) + (element.dataset.suffix || '');
        }
    }, 16);
}

// Activar contadores cuando sean visibles
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const statElement = entry.target.querySelector('h4');
            const targetValue = parseInt(statElement.textContent);
            if (!isNaN(targetValue)) {
                statElement.dataset.suffix = statElement.textContent.replace(/[0-9]/g, '');
                animateCounter(statElement, targetValue);
            }
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('.result-stat').forEach(stat => {
    statsObserver.observe(stat);
});

// Manejo de formularios (si se agregan en el futuro)
const contactForms = document.querySelectorAll('form');
contactForms.forEach(form => {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        // Aquí se puede agregar la lógica de envío de formulario
        console.log('Formulario enviado');
    });
});

// Loading state para botones
document.querySelectorAll('button, .btn-primary, .btn-secondary, .btn-project').forEach(button => {
    button.addEventListener('click', function() {
        // Efecto de click
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// Prevenir comportamiento por defecto en enlaces vacíos
document.querySelectorAll('a[href=""]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Este enlace aún no tiene destino configurado');
    });
});

// Parallax effect suave en hero
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual && scrolled < window.innerHeight) {
        heroVisual.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
});

// Mobile menu toggle (si se agrega en el futuro)
const createMobileMenu = () => {
    const nav = document.querySelector('.nav-list');
    const menuButton = document.createElement('button');
    menuButton.classList.add('mobile-menu-toggle');
    menuButton.innerHTML = '☰';
    menuButton.style.display = 'none';
    
    if (window.innerWidth <= 968) {
        menuButton.style.display = 'block';
        document.querySelector('.nav-container').prepend(menuButton);
        
        menuButton.addEventListener('click', () => {
            nav.classList.toggle('active');
        });
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('VEX Website loaded successfully');
    
    // Agregar clase para animaciones CSS
    document.body.classList.add('loaded');
});

// Resize handler
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        // Lógica para resize si es necesario
    }, 250);
});

// Preload de imágenes importantes
const preloadImages = () => {
    const images = document.querySelectorAll('img[data-preload]');
    images.forEach(img => {
        const source = img.dataset.src;
        if (source) {
            img.src = source;
        }
    });
};

window.addEventListener('load', preloadImages);

// Easter egg: Konami code
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            console.log('🎉 ¡Código Konami activado! VEX te saluda 🚀');
            document.body.style.animation = 'rainbow 2s ease infinite';
            konamiIndex = 0;
        }
    } else {
        konamiIndex = 0;
    }
});

// ============================================
// Menu Toggle - Versión Mejorada
// ============================================

const menuToggle = document.querySelector('.menu-toggle');
const navList = document.querySelector('.nav-list');
const body = document.body;

if (menuToggle && navList) {
    // Toggle menú
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menuToggle.classList.toggle('active');
        navList.classList.toggle('active');
        body.classList.toggle('menu-open');
    });

    // Cerrar menú al hacer click en un link
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', () => {
            menuToggle.classList.remove('active');
            navList.classList.remove('active');
            body.classList.remove('menu-open');
        });
    });

    // Cerrar menú al hacer click fuera de él
    document.addEventListener('click', (e) => {
        if (!navList.contains(e.target) && !menuToggle.contains(e.target)) {
            if (navList.classList.contains('active')) {
                menuToggle.classList.remove('active');
                navList.classList.remove('active');
                body.classList.remove('menu-open');
            }
        }
    });

    // Cerrar menú con la tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navList.classList.contains('active')) {
            menuToggle.classList.remove('active');
            navList.classList.remove('active');
            body.classList.remove('menu-open');
        }
    });

    // Ajustar al cambiar tamaño de ventana
    window.addEventListener('resize', () => {
        if (window.innerWidth > 968) {
            menuToggle.classList.remove('active');
            navList.classList.remove('active');
            body.classList.remove('menu-open');
        }
    });
}