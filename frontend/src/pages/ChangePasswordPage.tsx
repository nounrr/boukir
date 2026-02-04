import React from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useChangePasswordMutation } from '../store/api/authApi';
import { useAppDispatch, useAuth } from '../hooks/redux';
import { setPasswordChangeRequired } from '../store/slices/authSlice';
import { useToast } from '../components/ui/use-toast';

const schema = Yup.object().shape({
  old_password: Yup.string().required('Ancien mot de passe requis'),
  new_password: Yup.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .required('Nouveau mot de passe requis'),
  confirm_password: Yup.string()
    .oneOf([Yup.ref('new_password')], 'Les mots de passe ne correspondent pas')
    .required('Confirmation requise'),
});

const ChangePasswordPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { passwordChangeRequired } = useAuth();
  const { toast } = useToast();
  const [changePassword, { isLoading }] = useChangePasswordMutation();

  const [showOld, setShowOld] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <KeyRound className="h-12 w-12 text-purple-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Changer le mot de passe
        </h2>
        {passwordChangeRequired && (
          <p className="mt-2 text-center text-sm text-gray-600">
            Chaque lundi, le changement de mot de passe est obligatoire.
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl border border-gray-100">
          <Formik
            initialValues={{ old_password: '', new_password: '', confirm_password: '' }}
            validationSchema={schema}
            onSubmit={async (values, { setSubmitting, setStatus }) => {
              setStatus(undefined);
              try {
                const result = await changePassword(values).unwrap();
                if (result?.ok) {
                  dispatch(setPasswordChangeRequired(false));
                  toast({
                    title: 'Succès',
                    description: result.message || 'Mot de passe modifié',
                  });
                  navigate('/dashboard', { replace: true });
                } else {
                  setStatus('Erreur lors du changement de mot de passe');
                }
              } catch (err: any) {
                setStatus(err?.data?.message || 'Erreur lors du changement de mot de passe');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting, status }) => (
              <Form className="space-y-6">
                <div>
                  <label htmlFor="old_password" className="block text-sm font-semibold text-gray-700 mb-1">
                    Ancien mot de passe
                  </label>
                  <div className="mt-1 relative">
                    <Field
                      id="old_password"
                      name="old_password"
                      type={showOld ? 'text' : 'password'}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center hover:text-blue-600 transition-colors duration-200"
                      onClick={() => setShowOld(!showOld)}
                    >
                      {showOld ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                    </button>
                    <ErrorMessage name="old_password" component="div" className="mt-2 text-sm text-red-600" />
                  </div>
                </div>

                <div>
                  <label htmlFor="new_password" className="block text-sm font-semibold text-gray-700 mb-1">
                    Nouveau mot de passe
                  </label>
                  <div className="mt-1 relative">
                    <Field
                      id="new_password"
                      name="new_password"
                      type={showNew ? 'text' : 'password'}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center hover:text-blue-600 transition-colors duration-200"
                      onClick={() => setShowNew(!showNew)}
                    >
                      {showNew ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                    </button>
                    <ErrorMessage name="new_password" component="div" className="mt-2 text-sm text-red-600" />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm_password" className="block text-sm font-semibold text-gray-700 mb-1">
                    Confirmer le nouveau mot de passe
                  </label>
                  <div className="mt-1 relative">
                    <Field
                      id="confirm_password"
                      name="confirm_password"
                      type={showConfirm ? 'text' : 'password'}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center hover:text-blue-600 transition-colors duration-200"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                    </button>
                    <ErrorMessage name="confirm_password" component="div" className="mt-2 text-sm text-red-600" />
                  </div>
                </div>

                {status && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{status}</div>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting || isLoading}
                    className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Modification...
                      </div>
                    ) : (
                      'Modifier le mot de passe'
                    )}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
