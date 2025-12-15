import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

declare global {
  interface Window {
    google: any;
    FB: any;
  }
}

const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    type_compte: 'Client',
    password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  // Initialize Google Sign-In
  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signup-button'),
        {
          theme: 'outline',
          size: 'large',
          text: 'signup_with',
          shape: 'rectangular',
          width: 320,
        }
      );
    }

    // Initialize Facebook SDK
    if (window.FB) {
      window.FB.init({
        appId: import.meta.env.VITE_FACEBOOK_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v18.0',
      });
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Traditional Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Erreur lors de l\'inscription');
        setLoading(false);
        return;
      }

      // Store token and redirect
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError('Erreur de connexion au serveur');
      setLoading(false);
    }
  };

  // Google Sign-Up Callback
  const handleGoogleCallback = async (response: any) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetch(`${API_URL}/api/users/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await result.json();

      if (!result.ok) {
        setError(data.message || 'Erreur d\'inscription avec Google');
        setLoading(false);
        return;
      }

      // Store token and redirect
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError('Erreur d\'inscription avec Google');
      setLoading(false);
    }
  };

  // Facebook Sign-Up
  const handleFacebookSignup = () => {
    setError('');
    setLoading(true);

    window.FB.login(
      async (response: any) => {
        if (response.authResponse) {
          try {
            const result = await fetch(`${API_URL}/api/users/auth/facebook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accessToken: response.authResponse.accessToken,
                userID: response.authResponse.userID,
              }),
            });

            const data = await result.json();

            if (!result.ok) {
              setError(data.message || 'Erreur d\'inscription avec Facebook');
              setLoading(false);
              return;
            }

            // Store token and redirect
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            navigate('/dashboard');
          } catch (err) {
            setError('Erreur d\'inscription avec Facebook');
            setLoading(false);
          }
        } else {
          setError('Inscription Facebook annulée');
          setLoading(false);
        }
      },
      { scope: 'public_profile,email' }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Créer un compte
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Vous avez déjà un compte ?{' '}
            <a href="/login" className="font-medium text-yellow-600 hover:text-yellow-500">
              Se connecter
            </a>
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Registration Form */}
        <form className="mt-8 space-y-4" onSubmit={handleRegister}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="prenom" className="block text-sm font-medium text-gray-700">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                id="prenom"
                name="prenom"
                type="text"
                required
                value={formData.prenom}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                placeholder="Ahmed"
              />
            </div>
            <div>
              <label htmlFor="nom" className="block text-sm font-medium text-gray-700">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                id="nom"
                name="nom"
                type="text"
                required
                value={formData.nom}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                placeholder="Benali"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Adresse email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="exemple@email.com"
            />
          </div>

          <div>
            <label htmlFor="telephone" className="block text-sm font-medium text-gray-700">
              Numéro de téléphone
            </label>
            <input
              id="telephone"
              name="telephone"
              type="tel"
              value={formData.telephone}
              onChange={handleChange}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="0612345678"
            />
          </div>

          <div>
            <label htmlFor="type_compte" className="block text-sm font-medium text-gray-700">
              Type de compte <span className="text-red-500">*</span>
            </label>
            <select
              id="type_compte"
              name="type_compte"
              value={formData.type_compte}
              onChange={handleChange}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
            >
              <option value="Client">Client</option>
              <option value="Artisan/Promoteur">Artisan/Promoteur</option>
            </select>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Mot de passe <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={formData.password}
              onChange={handleChange}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="Min. 8 caractères"
            />
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700">
              Confirmer le mot de passe <span className="text-red-500">*</span>
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              value={formData.confirm_password}
              onChange={handleChange}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="Répétez le mot de passe"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
            >
              {loading ? 'Création du compte...' : 'Créer un compte'}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">OU INSCRIVEZ-VOUS AVEC</span>
          </div>
        </div>

        {/* SSO Buttons */}
        <div className="space-y-3">
          {/* Google Sign-Up Button */}
          <div id="google-signup-button" className="flex justify-center"></div>

          {/* Facebook Sign-Up Button */}
          <button
            onClick={handleFacebookSignup}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
