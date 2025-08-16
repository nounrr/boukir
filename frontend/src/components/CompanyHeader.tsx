
import React, { useState, useEffect } from 'react';
import logo from"./logo.png"
import logo1 from"./logo1.png"
interface CompanyHeaderProps {
  companyType?: 'DIAMOND' | 'MPC';
}

const CompanyHeader: React.FC<CompanyHeaderProps> = ({ 
  companyType = 'DIAMOND' 
}) => {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  // Essayer de charger le logo avec différentes méthodes
  useEffect(() => {
    // Méthode 1: Chemin public
    const img = new Image();
    img.onload = () => setLogoSrc('/logo.png');
    img.onerror = () => {
      // Méthode 2: Essayer avec un autre chemin
      const img2 = new Image();
      img2.onload = () => setLogoSrc('./logo.png');
      img2.onerror = () => {
        console.warn('Logo not found, using placeholder');
        setLogoSrc(null);
      };
      img2.src = './logo.png';
    };
    img.src = '/logo.png';
  }, []);
  const logoCurrent = companyType === 'MPC' ? logo1 : logo;
  // Définir les informations selon le type de société
  const companyInfo = {
    DIAMOND: {
      name: 'BOUKIR DIAMOND',
      subtitle: 'CONSTRUCTION STORE',
      description: 'Vente de Matériaux de Construction céramique, et de Marbre',
    },
    MPC: {
      name: 'MPC BOUKIR',
      subtitle: '', 
      description: 'Vente de Matériaux de Construction céramique, et de Marbre',
    }
  };

  const currentCompany = companyInfo[companyType];

  return (
    <div className="flex justify-center items-center mb-6 border-b-2 border-orange-500 pb-4">
      <div className="flex items-center justify-center mb-4">
        <div className="w-24 h-16 mr-4 flex items-center justify-center rounded">
            
            <img 
            src={logoCurrent}
              alt={`Logo ${currentCompany.name}`} 
              className="logo-large object-contain"
            />
          
        </div>
        
        <div className='text-center titles'>
          <h1 className="text-xl font-bold text-gray-800 mb-1">{currentCompany.name}</h1>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">{currentCompany.subtitle}</h2>
          <p className="text-sm text-gray-600 italic">{currentCompany.description}</p>
        </div>
      </div>
    </div>
  );
};

export default CompanyHeader;
