// ===== FREELANCERHUB FRONTEND JS (INTEGRATED) =====

document.addEventListener('DOMContentLoaded', () => {

    /**
     * 1. THEME TOGGLE LOGIC (Bootstrap 5.3 Native)
     * Handles global light/dark mode using data-bs-theme
     */
    const themeToggle = document.getElementById('themeToggle');
    const htmlElement = document.documentElement;

    const setTheme = (theme) => {
        htmlElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('theme', theme);
        
        const icon = themeToggle?.querySelector('i');
        if (icon) {
            if (theme === 'dark') {
                icon.classList.replace('bi-moon-stars', 'bi-sun-fill');
                themeToggle.classList.add('text-warning');
            } else {
                icon.classList.replace('bi-sun-fill', 'bi-moon-stars');
                themeToggle.classList.remove('text-warning');
            }
        }
    };

    if (themeToggle) {
        // Load saved preference or system default
        const savedTheme = localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        setTheme(savedTheme);

        themeToggle.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-bs-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    /**
     * 2. FLASH ALERTS
     * Auto-dismisses Bootstrap alerts after 3.5 seconds
     */
    document.querySelectorAll('.alert').forEach(el => {
        setTimeout(() => { 
            el.style.transition = 'opacity .5s ease'; 
            el.style.opacity = '0';
        }, 3000);
        setTimeout(() => { el.remove(); }, 3500);
    });

    /**
     * 3. BUDGET VALIDATION
     * Ensures Max Budget is never lower than Min Budget
     */
    const budgetMin = document.querySelector('input[name="budget_min"]');
    const budgetMax = document.querySelector('input[name="budget_max"]');
    if (budgetMin && budgetMax) {
        budgetMax.addEventListener('blur', () => {
            if (Number(budgetMax.value) > 0 && Number(budgetMax.value) < Number(budgetMin.value)) {
                alert('Maximum budget must be greater than or equal to minimum budget.');
                budgetMax.value = budgetMin.value; 
                budgetMax.focus();
            }
        });
    }

    /**
     * 4. CHARACTER COUNTERS
     * Automatically adds counters to textareas with maxlength attribute
     */
    document.querySelectorAll('textarea[maxlength]').forEach(ta => {
        const max = parseInt(ta.getAttribute('maxlength'));
        const counter = document.createElement('div');
        counter.className = 'char-counter small text-muted text-end mt-1';
        counter.textContent = `${ta.value.length} / ${max}`;
        ta.parentNode.insertBefore(counter, ta.nextSibling);
        
        ta.addEventListener('input', () => {
            const currentLength = ta.value.length;
            counter.textContent = `${currentLength} / ${max}`;
            counter.style.color = currentLength >= max ? 'var(--bs-danger)' : '';
        });
    });

    /**
     * 5. PREVENT DOUBLE SUBMIT
     * Disables submit buttons and shows a spinner on click
     */
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function() {
            const btn = this.querySelector('button[type="submit"]');
            if (btn && !btn.classList.contains('no-disable')) {
                // Short timeout to allow browser validation to trigger first
                setTimeout(() => {
                    btn.disabled = true;
                    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Processing...`;
                }, 50);
            }
        });
    });

    /**
     * 6. ACTIVE NAVIGATION
     * Highlights the current link in the Bootstrap navbar
     */
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(a => {
        const href = a.getAttribute('href');
        if (href === path || (path.startsWith(href) && href !== '/')) {
            a.classList.add('active');
        }
    });

    /**
     * 7. EMAIL VERIFICATION INTERACTION (NEW)
     * Handles the 'Verify Now' button logic in verify.ejs
     */
    const verifyBtn = document.getElementById('verify-arrow-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const verifyContent = document.getElementById('verify-content');
            const successArea = document.getElementById('success-area');
            const statusIcon = document.getElementById('status-icon');
            const mainIcon = document.getElementById('main-icon');
            const token = window.location.pathname.split('/').pop();

            verifyBtn.disabled = true;
            verifyBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Verifying...`;

            try {
                const response = await fetch(`/verify-account/${token}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    verifyContent.style.display = 'none';
                    successArea.style.display = 'block';
                    if (statusIcon) statusIcon.className = 'icon-box-lg bg-success-soft text-success mx-auto d-flex align-items-center justify-content-center rounded-circle';
                    if (mainIcon) mainIcon.className = 'bi bi-check-circle-fill fs-1';
                } else {
                    alert("Verification link expired or invalid.");
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = `Try Again <i class="bi bi-arrow-right-circle ms-2"></i>`;
                }
            } catch (err) {
                console.error("Verification Error:", err);
                verifyBtn.disabled = false;
            }
        });
    }
});