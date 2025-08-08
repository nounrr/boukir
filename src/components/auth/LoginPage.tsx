import React from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { useAppDispatch, useAuth } from '../../hooks/redux';
import { useLoginMutation } from '../../store/api/authApi';
import { loginStart, loginSuccess, loginFailure } from '../../store/slices/authSlice';
import { LogIn, Eye, EyeOff, User } from 'lucide-react';
import type { LoginCredentials } from '../../types';

// Schéma de validation avec Yup
const loginSchema = Yup.object().shape({
  cin: Yup.string()
    .matches(/^[A-Z]{2}\d{6}$/, 'Format CIN invalide (ex: BK123456)')
    .required('Le CIN est obligatoire'),
  password: Yup.string()
    .min(3, 'Le mot de passe doit contenir au moins 3 caractères')
    .required('Le mot de passe est obligatoire'),
});

const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { loading, error } = useAuth();
  const [login] = useLoginMutation();
  const [showPassword, setShowPassword] = React.useState(false);

  const handleSubmit = async (values: LoginCredentials) => {
    dispatch(loginStart());
    
    try {
      const result = await login(values).unwrap();
      dispatch(loginSuccess(result));
    } catch (err: any) {
      const errorMessage = err?.data?.message || 'Erreur de connexion';
      dispatch(loginFailure(errorMessage));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
            <LogIn className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Connexion à votre compte
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Application de Gestion Commerciale
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl border border-gray-100">
          <Formik
            initialValues={{ cin: '', password: '' }}
            validationSchema={loginSchema}
            onSubmit={handleSubmit}
          >
            {({ isSubmitting }) => (
              <Form className="space-y-6">
                <div>
                  <label htmlFor="cin" className="block text-sm font-semibold text-gray-700 mb-1">
                    CIN
                  </label>
                  <div className="mt-1">
                    <Field
                      id="cin"
                      name="cin"
                      type="text"
                      placeholder="Ex: BK123456"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <ErrorMessage
                      name="cin"
                      component="div"
                      className="mt-2 text-sm text-red-600 flex items-center gap-1"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                    Mot de passe
                  </label>
                  <div className="mt-1 relative">
                    <Field
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center hover:text-blue-600 transition-colors duration-200"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                    <ErrorMessage
                      name="password"
                      component="div"
                      className="mt-2 text-sm text-red-600 flex items-center gap-1"
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting || loading}
                    className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg"
                  >
                    <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                      <LogIn className="h-5 w-5 text-blue-200 group-hover:text-white transition-colors" aria-hidden="true" />
                    </span>
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Connexion...
                      </div>
                    ) : (
                      'Se connecter'
                    )}
                  </button>
                </div>

                <div className="text-center">
                  <p className="text-xs text-gray-600">
                    Utilisez votre CIN et mot de passe pour accéder à l'application
                  </p>
                </div>
              </Form>
            )}
          </Formik>

          {/* Informations de test */}
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              Comptes de test :
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="font-semibold text-blue-800 mb-1">PDG</div>
                <div className="text-blue-700">
                  <div><strong>CIN :</strong> BK123456</div>
                  <div><strong>Mot de passe :</strong> pdg123</div>
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="font-semibold text-green-800 mb-1">Employé</div>
                <div className="text-green-700">
                  <div><strong>CIN :</strong> BK789012</div>
                  <div><strong>Mot de passe :</strong> emp123</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
