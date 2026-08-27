// ====== Plan Modal Logic ======
let _currentPlan = { name: '', price: 0, tokens: 0 };

function openPlanModal(planName, price, tokens) {
    _currentPlan = { name: planName, price, tokens };
    document.getElementById('modalPlanName').textContent = planName;
    document.getElementById('modalStep1').style.display = 'block';
    document.getElementById('modalStep2').style.display = 'none';
    document.getElementById('modalStep3').style.display = 'none';
    document.getElementById('step1Error').style.display = 'none';
    document.getElementById('signupForm').reset();
    document.getElementById('planModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePlanModal() {
    document.getElementById('planModal').style.display = 'none';
    document.body.style.overflow = '';
}

function goToStep2(e) {
    e.preventDefault();
    const password = document.getElementById('modalPassword').value;
    const confirm = document.getElementById('modalPasswordConfirm').value;
    const errorEl = document.getElementById('step1Error');

    if (password.length < 6) {
        errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        errorEl.style.display = 'block';
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = 'Las contraseñas no coinciden.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';

    document.getElementById('paypalPlanName').textContent = _currentPlan.name;
    document.getElementById('paypalTokens').textContent = _currentPlan.tokens.toLocaleString('es-MX');
    document.getElementById('paypalPrice').textContent = _currentPlan.price === 0
        ? 'Gratis'
        : '$' + _currentPlan.price.toLocaleString('es-MX') + ' MXN/mes';

    document.getElementById('modalStep1').style.display = 'none';
    document.getElementById('modalStep2').style.display = 'block';
    document.getElementById('step2Error').style.display = 'none';
}

function backToStep1() {
    document.getElementById('modalStep2').style.display = 'none';
    document.getElementById('modalStep1').style.display = 'block';
}

async function createAccount() {
    const email = document.getElementById('modalEmail').value.trim();
    const password = document.getElementById('modalPassword').value;
    const errorEl = document.getElementById('step2Error');
    const btn = document.getElementById('createAccountBtn');
    const btnText = document.getElementById('createBtnText');
    const spinner = document.getElementById('createBtnSpinner');

    btnText.style.display = 'none';
    spinner.style.display = 'block';
    btn.disabled = true;
    errorEl.style.display = 'none';

    try {
        const auth = window._avotexAuth;
        const createUser = window._createUserWithEmailAndPassword;

        await createUser(auth, email, password);

        const SUPABASE_URL = window._SUPABASE_URL;
        const SUPABASE_ANON_KEY = window._SUPABASE_ANON_KEY;

        await fetch(`${SUPABASE_URL}/rest/v1/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ user_email: email, tokens: _currentPlan.tokens })
        });

        document.getElementById('modalStep2').style.display = 'none';
        document.getElementById('modalStep3').style.display = 'block';

    } catch (err) {
        let msg = 'Ocurrió un error al crear la cuenta.';
        if (err.code === 'auth/email-already-in-use') msg = 'Este correo ya está registrado.';
        else if (err.code === 'auth/invalid-email') msg = 'El correo no es válido.';
        else if (err.code === 'auth/weak-password') msg = 'La contraseña es muy débil.';
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    } finally {
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
        btn.disabled = false;
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closePlanModal();
});

document.addEventListener('DOMContentLoaded', function() {
    const overlay = document.getElementById('planModal');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closePlanModal();
        });
    }
});
// ====== End Plan Modal Logic ======

document.addEventListener('DOMContentLoaded', function() {

    // Menú móvil toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function() {
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        });

        // Cerrar menú al hacer clic en un enlace
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Cerrar menú al hacer clic fuera
        document.addEventListener('click', function(e) {
            if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > lastScroll && currentScroll > 100) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
            if (currentScroll > 50) {
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
                navbar.style.backdropFilter = 'blur(10px)';
            } else {
                navbar.style.background = 'var(--white)';
                navbar.style.backdropFilter = 'none';
            }
        }
        
        lastScroll = currentScroll;
    });


    const stats = document.querySelectorAll('.stat-number');
    let statsStarted = false;

    function startCounting(stat) {
        const target = parseInt(stat.getAttribute('data-target'));
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;

        const counter = setInterval(() => {
            current += step;
            if (current >= target) {
                stat.textContent = target;
                clearInterval(counter);
            } else {
                stat.textContent = Math.floor(current);
            }
        }, 16);
    }


    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.classList.contains('stat-item')) {
                    entry.target.classList.add('visible');
                    if (!statsStarted) {
                        stats.forEach(startCounting);
                        statsStarted = true;
                    }
                } else {
                    entry.target.classList.add('visible');
                }
            }
        });
    }, observerOptions);


    document.querySelectorAll('.feature-card, .pricing-card, .stat-item').forEach(el => {
        observer.observe(el);
    });

    // Reproduce videos solo cuando están visibles para evitar descargas simultáneas.
    const viewportVideos = document.querySelectorAll('video[data-autoplay-on-view]');
    if (viewportVideos.length) {
        const reduceVideoMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting && !reduceVideoMotion) {
                    video.play().catch(() => {
                        // El póster permanece visible si el navegador bloquea la reproducción.
                    });
                } else {
                    video.pause();
                }
            });
        }, {
            threshold: 0.12,
            rootMargin: '120px 0px'
        });

        viewportVideos.forEach(video => videoObserver.observe(video));
    }


    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const submitBtn = this.querySelector('.submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Enviando...';
            submitBtn.disabled = true;

 
            setTimeout(() => {
                showNotification('¡Mensaje enviado con éxito!', 'success');
                contactForm.reset();
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }, 1500);
        });
    }


    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const hash = this.getAttribute('href');
            const target = document.querySelector(hash);
            if (target) {
                history.pushState(null, '', hash);
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }, 100);
    }

    // Carrusel de monitoreo fuera del celular
    const fieldCarousel = document.querySelector('[data-carousel]');
    if (fieldCarousel) {
        const slides = Array.from(fieldCarousel.querySelectorAll('.field-slide'));
        const dots = Array.from(fieldCarousel.querySelectorAll('[data-slide-to]'));
        const previousButton = fieldCarousel.querySelector('[data-carousel-prev]');
        const nextButton = fieldCarousel.querySelector('[data-carousel-next]');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let activeSlide = 0;
        let autoplayTimer;
        let pointerStartX = null;

        const stopAutoplay = () => {
            if (autoplayTimer) window.clearInterval(autoplayTimer);
        };

        const startAutoplay = () => {
            stopAutoplay();
            if (!reduceMotion) {
                autoplayTimer = window.setInterval(() => showSlide(activeSlide + 1, false), 4800);
            }
        };

        const showSlide = (index, restartAutoplay = true) => {
            activeSlide = (index + slides.length) % slides.length;
            const previousSlide = (activeSlide - 1 + slides.length) % slides.length;
            const nextSlide = (activeSlide + 1) % slides.length;

            slides.forEach((slide, slideIndex) => {
                slide.classList.toggle('is-active', slideIndex === activeSlide);
                slide.classList.toggle('is-prev', slideIndex === previousSlide);
                slide.classList.toggle('is-next', slideIndex === nextSlide);
                slide.setAttribute('aria-hidden', String(slideIndex !== activeSlide));
            });

            dots.forEach((dot, dotIndex) => {
                const isActive = dotIndex === activeSlide;
                dot.classList.toggle('is-active', isActive);
                dot.setAttribute('aria-selected', String(isActive));
                dot.tabIndex = isActive ? 0 : -1;
            });

            if (restartAutoplay) startAutoplay();
        };

        previousButton.addEventListener('click', () => showSlide(activeSlide - 1));
        nextButton.addEventListener('click', () => showSlide(activeSlide + 1));
        dots.forEach(dot => {
            dot.addEventListener('click', () => showSlide(Number(dot.dataset.slideTo)));
        });
        slides.forEach((slide, slideIndex) => {
            slide.addEventListener('click', () => {
                if (slideIndex !== activeSlide) showSlide(slideIndex);
            });
        });

        fieldCarousel.addEventListener('mouseenter', stopAutoplay);
        fieldCarousel.addEventListener('mouseleave', startAutoplay);
        fieldCarousel.addEventListener('focusin', stopAutoplay);
        fieldCarousel.addEventListener('focusout', startAutoplay);
        fieldCarousel.addEventListener('pointerdown', event => {
            pointerStartX = event.clientX;
        });
        fieldCarousel.addEventListener('pointerup', event => {
            if (pointerStartX === null) return;
            const travel = event.clientX - pointerStartX;
            pointerStartX = null;
            if (Math.abs(travel) < 45) return;
            showSlide(activeSlide + (travel < 0 ? 1 : -1));
        });
        fieldCarousel.addEventListener('pointercancel', () => {
            pointerStartX = null;
        });
        fieldCarousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') showSlide(activeSlide - 1);
            if (event.key === 'ArrowRight') showSlide(activeSlide + 1);
        });

        showSlide(0);
    }

    /*
    const heroImage = document.querySelector('.hero-image');
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        if (heroImage) {
            heroImage.style.transform = `translateY(${scrolled * 0.1}px)`;
        }
    });
    */
});