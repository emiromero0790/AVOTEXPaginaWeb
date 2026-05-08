
class ShoppingCart {
    constructor() {
        this.items = JSON.parse(localStorage.getItem('cartItems')) || [];
        this.updateCartIcon();
        
        if (window.location.pathname.includes('cart.html')) {
            this.renderCartPage();
            this.setupCheckoutForm();
            this.setupQuantityControls();
            this.setupRemoveButtons();
        }
    }

    setupRemoveButtons() {
        document.querySelectorAll('.remove-item').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const index = parseInt(button.getAttribute('data-index'));
                this.removeItem(index);
            });
        });
    }

    setupQuantityControls() {
        document.querySelectorAll('.quantity-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const index = parseInt(button.getAttribute('data-index'));
                const change = button.classList.contains('minus') ? -1 : 1;
                this.updateQuantity(index, change);
            });
        });
    }

    addItem(id, name, price, product, image, quantity = 1) {
        const existingItem = this.items.find(item => item.id === id);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.items.push({
                id,
                name,
                price,
                product,
                image,
                quantity
            });
        }
        
        this.saveCart();
        this.updateCartIcon();
        this.showNotification('Producto agregado al carrito');
    }

    removeItem(index) {
        if (index >= 0 && index < this.items.length) {
            this.items.splice(index, 1);
            this.saveCart();
            this.updateCartIcon();
            if (window.location.pathname.includes('cart.html')) {
                this.renderCartPage();
            }
        }
    }

    updateQuantity(index, change) {
        if (index >= 0 && index < this.items.length) {
            const item = this.items[index];
            const newQuantity = item.quantity + change;
            
            if (newQuantity > 0) {
                item.quantity = newQuantity;
                this.saveCart();
                this.updateCartIcon();
                if (window.location.pathname.includes('cart.html')) {
                    this.renderCartPage();
                }
            }
        }
    }

    calculateTotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    saveCart() {
        localStorage.setItem('cartItems', JSON.stringify(this.items));
    }

    updateCartIcon() {
        const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
        document.querySelectorAll('.cart-icon').forEach(icon => {
            icon.textContent = `🛒 Carrito (${totalItems})`;
            icon.href = 'cart.html';
        });
    }

    initializePayPal() {
        if (this.items.length === 0) return;

        const total = this.calculateTotal() + 99; 
        const paypalContainer = document.getElementById('paypal-button-container');
        

        paypalContainer.innerHTML = '';

        paypal.Buttons({
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: total.toFixed(2),
                            currency_code: 'MXN'
                        },
                        description: 'Compra en VEX'
                    }]
                });
            },
            onApprove: (data, actions) => {
                return actions.order.capture().then((details) => {
                    localStorage.removeItem('cartItems');
                    window.location.href = 'confirmation.html';
                });
            },
            onError: (err) => {
                console.error('PayPal Error:', err);
                alert('Hubo un error al procesar el pago. Por favor, intenta de nuevo.');
            }
        }).render('#paypal-button-container');
    }

    renderCartPage() {
        const cartItems = document.getElementById('cartItems');
        const cartSummary = document.getElementById('cartSummary');
        
        if (this.items.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <p>Tu carrito está vacío</p>
                    <a href="index.html" class="continue-shopping">Continuar Comprando</a>
                </div>
            `;
            cartSummary.style.display = 'none';
            return;
        }

        cartItems.innerHTML = this.items.map((item, index) => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div class="item-details">
                    <span class="item-name">${item.name}</span>
                    <span class="item-variant">${item.product}</span>
                    <span class="item-price">$${item.price.toFixed(2)}</span>
                </div>
                <div class="item-actions">
                    <div class="quantity-controls">
                        <button class="quantity-btn minus" data-index="${index}">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn plus" data-index="${index}">+</button>
                    </div>
                    <button class="remove-item" data-index="${index}">🗑️</button>
                </div>
            </div>
        `).join('');

        const subtotal = this.calculateTotal();
        const shipping = 99;
        const total = subtotal + shipping;

        cartSummary.innerHTML = `
            <div class="summary-row">
                <span>Subtotal</span>
                <span>$${subtotal.toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <span>Envío</span>
                <span>$${shipping.toFixed(2)}</span>
            </div>
            <div class="summary-row total">
                <span>Total</span>
                <span>$${total.toFixed(2)}</span>
            </div>
            <div id="paypal-button-container"></div>
            <button class="checkout-btn">Pagar con Tarjeta</button>
        `;

        cartSummary.style.display = 'block';
        

        this.initializePayPal();
        this.setupQuantityControls();
        this.setupRemoveButtons();
    }

    setupCheckoutForm() {
        const form = document.getElementById('checkoutForm');
        if (form) {
            form.addEventListener('submit', (e) => this.processCheckout(e));
        }
    }

    processCheckout(e) {
        e.preventDefault();
        

        const form = e.target;
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }


        localStorage.removeItem('cartItems');
        window.location.href = 'confirmation.html';
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
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
}


const cart = new ShoppingCart();


function addToCart(id, name, price, product, image) {
    cart.addItem(id, name, price, product, image);
}


const style = document.createElement('style');
style.textContent = `
    .cart-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--azul);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateY(-100%);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1000;
    }

    .cart-notification.show {
        transform: translateY(0);
        opacity: 1;
    }
`;
document.head.appendChild(style);