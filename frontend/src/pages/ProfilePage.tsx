import React, { useMemo, useState } from 'react';
import { useAuth } from '../hooks/redux';
import { useGetEmployeeQueryServer, useUpdateEmployeeMutationServer } from '../store/api/employeesApi.server';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff, Save } from 'lucide-react';
import { showError, showSuccess } from '../utils/notifications';

const schema = Yup.object({
  nom_complet: Yup.string().optional(),
  date_embauche: Yup.string().optional(),
  password: Yup.string().min(6, 'Min 6 caractères').optional(),
});

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: me, isLoading } = useGetEmployeeQueryServer(userId!, { skip: !userId });
  const [updateEmployee] = useUpdateEmployeeMutationServer();
  const [showPwd, setShowPwd] = useState(false);

  const initial = useMemo(() => ({
    nom_complet: me?.nom_complet || '',
    date_embauche: me?.date_embauche ? String(me.date_embauche).slice(0, 10) : '',
    password: '',
  }), [me]);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: initial,
    validationSchema: schema,
    onSubmit: async (values, { resetForm }) => {
      if (!userId) return;
      try {
        const payload: any = {
          id: userId,
          updated_by: userId,
        };
        if (values.nom_complet !== undefined) {
          payload.nom_complet = values.nom_complet?.trim() || null;
        }
  // date_embauche is read-only in Profile and should not be updated from here
        if (values.password?.trim()) {
          payload.password = values.password.trim();
        }
        await updateEmployee(payload).unwrap();
        showSuccess('Profil mis à jour');
        resetForm({ values: { ...values, password: '' } });
      } catch (e) {
        console.error(e);
        showError("Erreur lors de la mise à jour");
      }
    },
  });

  if (!userId) return <div className="p-6">Utilisateur non trouvé</div>;
  if (isLoading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Mon profil</h1>
      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="profile-cin" className="block text-sm mb-1">CIN</label>
          <input id="profile-cin" className="w-full border rounded px-3 py-2 bg-gray-100" value={me?.cin || ''} disabled />
        </div>
        <div>
          <label htmlFor="profile-nom" className="block text-sm mb-1">Nom complet</label>
          <input
            id="profile-nom"
            name="nom_complet"
            value={formik.values.nom_complet}
            onChange={formik.handleChange}
            className="w-full border rounded px-3 py-2"
            placeholder="Votre nom"
          />
        </div>
        <div>
          <label htmlFor="profile-date" className="block text-sm mb-1">Date d'embauche</label>
          <input
            type="date"
            id="profile-date"
            name="date_embauche"
            value={formik.values.date_embauche}
            onChange={formik.handleChange}
            className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-700"
            disabled
            readOnly
          />
        </div>
        <div>
          <label htmlFor="profile-password" className="block text-sm mb-1">Nouveau mot de passe</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              id="profile-password"
              name="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              className="w-full border rounded px-3 py-2 pr-10"
              placeholder="********"
            />
            <button type="button" className="absolute inset-y-0 right-0 px-3 text-gray-500" onClick={() => setShowPwd(s => !s)}>
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Laissez vide pour ne pas changer.</p>
        </div>
        <div className="pt-2">
          <button type="submit" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            <Save size={16} />
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage;
