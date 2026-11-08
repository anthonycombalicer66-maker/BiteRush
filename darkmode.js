(() => {
    const preferenceKey = 'biterush_theme';
    const profileImageKey = 'biterush_profile_image';
    const defaultProfileImage = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%23f5c430'/%3E%3Ccircle cx='80' cy='62' r='26' fill='%23ffffff'/%3E%3Cpath d='M43 122c8-20 27-32 37-32s29 12 37 32' fill='%23ffffff'/%3E%3C/svg%3E";
    const authPageNames = new Set([
        'login',
        'signup',
        'googlelogin',
        'fblogin',
        'facebooklogin',
        'qrlogin',
        'forgotpassword'
    ]);
    const isAuthPage = window.location.pathname
        .split('/')
        .filter(Boolean)
        .some(segment => {
            const normalized = segment.toLowerCase().replace(/[^a-z]/g, '');
            return authPageNames.has(normalized)
                || normalized.includes('signup')
                || (normalized.includes('qr') && normalized.includes('login'));
        });
    let preference = 'light';

    const resolveProfileImage = value => {
        if (!value) return new URL(defaultProfileImage, window.location.href).href;
        if (/^(data:|blob:|https?:\/\/|file:)/i.test(value)) return value;
        try {
            return new URL(value, window.location.href).href;
        } catch (error) {
            return value;
        }
    };

    const applyProfileImage = () => {
        try {
            const savedImage = localStorage.getItem(profileImageKey);
            const profileImage = resolveProfileImage(savedImage || defaultProfileImage);
            const avatars = document.querySelectorAll(
                'img[data-biterush-profile-avatar], img[alt="Big User Profile"], img[alt="User Profile"], img[alt*="User Profile"]'
            );

            avatars.forEach(img => {
                img.src = profileImage;
                img.dataset.biterushProfileAvatar = 'true';
            });

            if (!savedImage) {
                localStorage.setItem(profileImageKey, profileImage);
            }
        } catch (error) {
            console.error('Unable to apply the saved profile image:', error);
        }
    };

    try {
        preference = isAuthPage
            ? 'light'
            : localStorage.getItem(preferenceKey) === 'dark'
                ? 'dark'
                : 'light';
        if (isAuthPage) localStorage.setItem(preferenceKey, 'light');
    } catch (error) {
        console.error('Unable to read or enforce the saved theme preference:', error);
    }

    const applyTheme = theme => {
        const useDarkTheme = !isAuthPage && theme === 'dark';
        document.documentElement.classList.toggle('dark-theme', useDarkTheme);
        document.body?.classList.toggle('dark-theme', useDarkTheme);
        return useDarkTheme ? 'dark' : 'light';
    };

    applyTheme(preference);

    document.addEventListener('DOMContentLoaded', () => {
        applyProfileImage();

        const activeTheme = applyTheme(preference);
        const themeToggle = document.getElementById('darkModeToggle');
        if (!themeToggle) return;

        themeToggle.checked = activeTheme === 'dark';
        themeToggle.disabled = isAuthPage;
        themeToggle.addEventListener('change', () => {
            const nextTheme = applyTheme(themeToggle.checked ? 'dark' : 'light');
            try {
                localStorage.setItem(preferenceKey, nextTheme);
                preference = nextTheme;
            } catch (error) {
                themeToggle.checked = applyTheme(preference) === 'dark';
                console.error('Unable to save the theme preference:', error);
            }
        });
    });
})();
