import React from 'react';
import { AlertCircle, Clock, CheckCircle, XCircle } from 'lucide-react';

interface ArtisanStatusBannerProps {
  demandeArtisan: boolean;
  artisanApprouve: boolean;
}

/**
 * Banner component to display artisan approval status in user dashboard
 */
export const ArtisanStatusBanner: React.FC<ArtisanStatusBannerProps> = ({
  demandeArtisan,
  artisanApprouve,
}) => {
  if (!demandeArtisan) {
    return null; // No request made
  }

  if (artisanApprouve) {
    // Request approved
    return (
      <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded-r-lg">
        <div className="flex items-start">
          <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">
              Compte Artisan/Promoteur Activé
            </h3>
            <p className="mt-1 text-sm text-green-700">
              Votre demande pour devenir Artisan/Promoteur a été approuvée. 
              Vous avez maintenant accès à toutes les fonctionnalités réservées aux artisans.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Request pending
  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg">
      <div className="flex items-start">
        <Clock className="h-5 w-5 text-yellow-400 mt-0.5 animate-pulse" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Demande Artisan/Promoteur En Attente
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            Votre demande pour devenir Artisan/Promoteur est en cours d'examen par notre équipe. 
            Vous serez notifié par email dès qu'elle sera traitée.
          </p>
          <p className="mt-2 text-sm text-yellow-700 font-medium">
            En attendant, vous bénéficiez d'un accès Client standard.
          </p>
        </div>
      </div>
    </div>
  );
};

interface ArtisanStatusBadgeProps {
  typeCompte: 'Client' | 'Artisan/Promoteur' | 'Fournisseur';
  demandeArtisan?: boolean;
  artisanApprouve?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Badge component to display account type with artisan status
 */
export const ArtisanStatusBadge: React.FC<ArtisanStatusBadgeProps> = ({
  typeCompte,
  demandeArtisan = false,
  artisanApprouve = false,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1.5',
    lg: 'text-base px-3 py-2',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  // Artisan/Promoteur approved
  if (typeCompte === 'Artisan/Promoteur' && artisanApprouve) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-purple-100 text-purple-800 font-medium ${sizeClasses[size]}`}>
        <CheckCircle size={iconSizes[size]} />
        Artisan/Promoteur
      </span>
    );
  }

  // Pending artisan request
  if (demandeArtisan && !artisanApprouve) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-yellow-100 text-yellow-800 font-medium ${sizeClasses[size]}`}>
        <Clock size={iconSizes[size]} className="animate-pulse" />
        Client (Demande Artisan en attente)
      </span>
    );
  }

  // Regular client
  if (typeCompte === 'Client') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-800 font-medium ${sizeClasses[size]}`}>
        Client
      </span>
    );
  }

  // Fournisseur
  if (typeCompte === 'Fournisseur') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-800 font-medium ${sizeClasses[size]}`}>
        Fournisseur
      </span>
    );
  }

  return null;
};

interface ArtisanRequestButtonProps {
  onRequest: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Button to request Artisan/Promoteur upgrade
 */
export const ArtisanRequestButton: React.FC<ArtisanRequestButtonProps> = ({
  onRequest,
  loading = false,
  disabled = false,
}) => {
  return (
    <button
      onClick={onRequest}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          Traitement...
        </>
      ) : (
        <>
          <AlertCircle size={16} />
          Devenir Artisan/Promoteur
        </>
      )}
    </button>
  );
};

interface AccountTypeInfoProps {
  showArtisanBenefits?: boolean;
}

/**
 * Informational component explaining account types
 */
export const AccountTypeInfo: React.FC<AccountTypeInfoProps> = ({
  showArtisanBenefits = true,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Types de Comptes
      </h3>
      
      <div className="space-y-4">
        {/* Client */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">C</span>
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">Client</h4>
            <p className="text-sm text-gray-600 mt-1">
              Accès aux fonctionnalités de base : consultation du catalogue, 
              passage de commandes, suivi des livraisons.
            </p>
          </div>
        </div>

        {/* Artisan/Promoteur */}
        {showArtisanBenefits && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">A</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Artisan/Promoteur</h4>
              <p className="text-sm text-gray-600 mt-1">
                Accès privilégié avec :
              </p>
              <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                <li>Tarifs préférentiels</li>
                <li>Gestion de projets</li>
                <li>Accès aux produits professionnels</li>
                <li>Support prioritaire</li>
                <li>Factures détaillées</li>
              </ul>
              <p className="text-sm text-purple-600 font-medium mt-2">
                ⚠️ Validation requise par l'administration
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default {
  ArtisanStatusBanner,
  ArtisanStatusBadge,
  ArtisanRequestButton,
  AccountTypeInfo,
};
