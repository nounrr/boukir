import React, { useState, useRef } from 'react';
import { Upload, FileText, Download, AlertCircle, CheckCircle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { showError, showSuccess } from '../utils/notifications';
import { isValidDateString, normalizeDateString, formatDateOrText } from '../utils/dateUtils';
import { useGetTalonsQuery } from '../store/api/talonsApi';
import { useCreateOldTalonCaisseMutation } from '../store/slices/oldTalonsCaisseSlice';
import type { Talon } from '../types';

interface ImportedOldTalon {
  date_paiement?: string| null;
  fournisseur?: string;
  montant_cheque?: number;
  date_cheque?: string | null;
  numero_cheque?: string | null; // Peut être null
  validation?: 'Validé' | 'En attente' | 'Refusé' | 'Annulé';
  banque?: string;
  personne?: string; // Nom de la personne
  factures?: string; // Informations sur les factures
  disponible?: string; // Statut de disponibilité
  isValid?: boolean;
  errors?: string[];
  rowIndex?: number;
}

const ImportOldTalons = () => {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedData, setImportedData] = useState<ImportedOldTalon[]>([]);
  const [selectedTalon, setSelectedTalon] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RTK Query
  const { data: talons = [] } = useGetTalonsQuery(undefined);
  const [createOldTalonCaisse] = useCreateOldTalonCaisseMutation();

  const expectedHeaders = [
    'LA DATE',
    'FOURNISSEUR', 
    'MONTANT DE CHEQUE',
    'LA DATE DE CHEQUE',
    // 'NUMERO DE CHEQUE' - optionnel
    'VALIDATION',
    'la banque',
    'personne',
    'Factures', 
    'disponible'
  ];

  // Télécharger le template Excel
  const downloadTemplate = () => {
    const csvContent = expectedHeaders.join(',') + '\n' +
      '2025-01-15,Fournisseur SA,5000,2025-01-20,CHQ123456,En attente,Banque Populaire,Ahmed Ben Ali,FAC-001,Disponible\n' +
      '2025-01-16,Autre Fournisseur,3000,2025-01-25,CHQ789012,Validé,BMCE Bank,Sara Alami,FAC-002,En attente';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_anciens_talons.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Gérer la sélection de fichier
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setShowPreview(false);
      setImportedData([]);
    }
  };

  // Valider une ligne importée
  const validateImportedRow = (row: any, index: number): ImportedOldTalon => {
    const errors: string[] = [];
    const validated: ImportedOldTalon = {
      rowIndex: index + 1,
      isValid: true,
      errors: []
    };

    // Date de paiement (obligatoire)
    if (!row['LA DATE'] || !row['LA DATE'].trim()) {
      errors.push('Date de paiement manquante');
    } else {
      const dateStr = row['LA DATE'].trim();
      // Vérifier le format de date (YYYY-MM-DD ou DD/MM/YYYY)
      const dateFormats = [
        /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}$/  // DD/MM/YYYY
      ];
      
      let isValidFormat = dateFormats.some(format => format.test(dateStr));
      
      if (isValidFormat) {
        try {
          let dateToValidate: Date;
          if (dateStr.includes('/')) {
            // Format DD/MM/YYYY
            const [day, month, year] = dateStr.split('/').map(Number);
            dateToValidate = new Date(year, month - 1, day);
          } else {
            // Format YYYY-MM-DD
            dateToValidate = new Date(dateStr);
          }
          if (isNaN(dateToValidate.getTime()) || dateToValidate.getFullYear() < 1900 || dateToValidate.getFullYear() > 2100) {
            validated.date_paiement = null;
          } else {
            validated.date_paiement = dateToValidate.toISOString().split('T')[0]; // Normaliser au format YYYY-MM-DD
          }
        } catch {
          validated.date_paiement = null;
        }
      } else {
        validated.date_paiement = null;
      }
    }

    // Fournisseur (obligatoire)
    if (!row['FOURNISSEUR'] || !row['FOURNISSEUR'].trim()) {
      errors.push('Fournisseur manquant');
    } else {
      validated.fournisseur = row['FOURNISSEUR'].trim();
    }

    // Montant du chèque (obligatoire)
    if (!row['MONTANT DE CHEQUE']) {
      errors.push('Montant du chèque manquant');
    } else {
      const montant = parseFloat(row['MONTANT DE CHEQUE']);
      if (isNaN(montant) || montant <= 0) {
        errors.push('Montant du chèque invalide');
      } else {
        validated.montant_cheque = montant;
      }
    }

    // Date du chèque (obligatoire - peut être une date ou du texte)
    if (!row['LA DATE DE CHEQUE'] || !row['LA DATE DE CHEQUE'].trim()) {
      errors.push('Date du chèque manquante');
    } else {
      const dateStr = row['LA DATE DE CHEQUE'].trim();
      
      // Fonction pour vérifier si c'est une date valide
      const isValidDate = (str: string): { isDate: boolean, normalizedDate?: string } => {
        const dateFormats = [
          /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
          /^\d{2}\/\d{2}\/\d{4}$/  // DD/MM/YYYY
        ];
        
        const isDateFormat = dateFormats.some(format => format.test(str));
        
        if (isDateFormat) {
          try {
            let dateToValidate: Date;
            if (str.includes('/')) {
              // Format DD/MM/YYYY
              const [day, month, year] = str.split('/').map(Number);
              dateToValidate = new Date(year, month - 1, day);
            } else {
              // Format YYYY-MM-DD
              dateToValidate = new Date(str);
            }
            
            if (!isNaN(dateToValidate.getTime()) && dateToValidate.getFullYear() >= 1900 && dateToValidate.getFullYear() <= 2100) {
              return { isDate: true, normalizedDate: dateToValidate.toISOString().split('T')[0] };
            }
          } catch {
            // Si parsing échoue, on traite comme texte
          }
        }
        
        return { isDate: false };
      };
      
      const dateValidation = isValidDate(dateStr);
      
      if (dateValidation.isDate && dateValidation.normalizedDate) {
        // C'est une date valide, on la normalise
        validated.date_cheque = dateValidation.normalizedDate;
      } else {
        // C'est du texte, on le garde tel quel (par exemple "En attente", "Non défini", etc.)
        validated.date_cheque = dateStr;
      }
    }

    // Numéro du chèque (optionnel, peut être texte ou numérique)
    if (row['NUMERO DE CHEQUE'] && row['NUMERO DE CHEQUE'].trim()) {
      const numeroStr = String(row['NUMERO DE CHEQUE']).trim();
      
      // Vérifier que ce n'est pas trop long (limite raisonnable)
      if (numeroStr.length > 50) {
        errors.push('Numéro du chèque trop long (maximum 50 caractères)');
      } else {
        validated.numero_cheque = numeroStr; // Accepter tout texte ou numéro
      }
    } else {
      validated.numero_cheque = null; // Peut être null
    }

    // Validation (optionnel, par défaut "En attente")
    if (row['VALIDATION'] && row['VALIDATION'].trim()) {
      const validation = row['VALIDATION'].trim();
      if (['Validé', 'En attente', 'Refusé', 'Annulé'].includes(validation)) {
        validated.validation = validation as 'Validé' | 'En attente' | 'Refusé' | 'Annulé';
      } else {
        errors.push('Statut de validation invalide (Validé, En attente, Refusé, Annulé)');
      }
    } else {
      validated.validation = 'En attente';
    }

    // Banque (optionnel)
    if (row['la banque'] && row['la banque'].trim()) {
      validated.banque = row['la banque'].trim();
    }

    // Personne (optionnel)
    if (row['personne'] && row['personne'].trim()) {
      validated.personne = row['personne'].trim();
    }

    // Factures (optionnel)
    if (row['Factures'] && row['Factures'].trim()) {
      validated.factures = row['Factures'].trim();
    }

    // Disponible (optionnel)
    if (row['disponible'] && row['disponible'].trim()) {
      validated.disponible = row['disponible'].trim();
    }

    validated.errors = errors;
    validated.isValid = errors.length === 0;

    return validated;
  };

  // Parser le fichier Excel/CSV
  const parseFile = async (file: File): Promise<ImportedOldTalon[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          
          let workbook: XLSX.WorkBook;
          let rawData: any[][] = [];
          
          if (file.name.toLowerCase().endsWith('.csv')) {
            // Parser CSV
            const text = data as string;
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
              reject(new Error('Le fichier doit contenir au moins une ligne de données en plus des headers'));
              return;
            }
            
            // Convertir CSV en format tableau
            rawData = lines.map(line => {
              // Parser CSV en gérant les guillemets
              const result = [];
              let current = '';
              let inQuotes = false;
              
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"' && (i === 0 || line[i - 1] === ',')) {
                  inQuotes = true;
                } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i + 1] === ',')) {
                  inQuotes = false;
                } else if (char === ',' && !inQuotes) {
                  result.push(current.trim());
                  current = '';
                } else if (char !== '"' || inQuotes) {
                  current += char;
                }
              }
              
              result.push(current.trim());
              return result;
            });
          } else {
            // Parser Excel
            const arrayBuffer = data as ArrayBuffer;
            workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convertir en format tableau avec préservation des types
            rawData = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1, 
              defval: '',
              raw: false, // Ne pas utiliser les valeurs brutes
              dateNF: 'yyyy-mm-dd' // Format de date normalisé
            }) as any[][];
            
            if (rawData.length < 2) {
              reject(new Error('Le fichier doit contenir au moins une ligne de données en plus des headers'));
              return;
            }
          }
          
          // Normaliser les headers (enlever les espaces et normaliser la casse)
          const headers = rawData[0].map((h: any) => String(h || '').trim());
          
          // Créer un mapping des headers pour être plus flexible
          const headerMapping: { [key: string]: string } = {};
          
          const findHeaderIndex = (searchTerms: string[]) => {
            for (let i = 0; i < headers.length; i++) {
              const header = headers[i].toLowerCase().trim();
              for (const term of searchTerms) {
                if (header === term.toLowerCase() || header.includes(term.toLowerCase())) {
                  return i;
                }
              }
            }
            return -1;
          };
          
          // Chercher les colonnes importantes avec des termes plus spécifiques
          const dateIndex = findHeaderIndex(['la date']);
          const fournisseurIndex = findHeaderIndex(['fournisseur']);
          const montantIndex = findHeaderIndex(['montant de cheque', 'montant du cheque', 'montant']);
          const dateChequeIndex = findHeaderIndex(['la date de cheque', 'date de cheque', 'date du cheque']);
          const numeroChequeIndex = findHeaderIndex(['numero de cheque', 'numéro de cheque', 'numero du cheque', 'numéro du cheque']);
          const validationIndex = findHeaderIndex(['validation']);
          const banqueIndex = findHeaderIndex(['la banque', 'banque']);
          const personneIndex = findHeaderIndex(['personne', 'nom personne', 'nom']);
          const facturesIndex = findHeaderIndex(['factures', 'facture', 'numero facture']);
          const disponibleIndex = findHeaderIndex(['disponible', 'statut', 'etat']);
          
          console.log('Headers détectés:', headers);
          console.log('Index colonnes:', {
            dateIndex,
            fournisseurIndex,
            montantIndex,
            dateChequeIndex,
            numeroChequeIndex,
            validationIndex,
            banqueIndex
          });
          
          // Vérifier que les colonnes obligatoires sont présentes
          const missingColumns = [];
          if (dateIndex === -1) missingColumns.push('Date de paiement');
          if (fournisseurIndex === -1) missingColumns.push('Fournisseur');
          if (montantIndex === -1) missingColumns.push('Montant du chèque');
          if (dateChequeIndex === -1) missingColumns.push('Date du chèque');
          // numeroChequeIndex n'est plus obligatoire
          
          if (missingColumns.length > 0) {
            reject(new Error(`Colonnes manquantes ou non reconnues: ${missingColumns.join(', ')}\n\nHeaders trouvés: ${headers.join(', ')}`));
            return;
          }
          
          // Fonction pour traiter les dates Excel ou le texte
          const parseExcelDateOrText = (value: any): string => {
            if (!value) return '';
            
            // Si c'est déjà un objet Date (traité par xlsx avec cellDates: true)
            if (value instanceof Date) {
              if (!isNaN(value.getTime()) && value.getFullYear() >= 1900 && value.getFullYear() <= 2100) {
                return normalizeDateString(value.toISOString().split('T')[0]);
              }
            }
            
            const stringValue = String(value).trim();
            
            // Vérifier si c'est une date valide et la normaliser
            if (isValidDateString(stringValue)) {
              return normalizeDateString(stringValue);
            }
            
            // Si c'est un nombre (date Excel) - fallback
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
              try {
                const excelBaseDate = new Date(1899, 11, 30);
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const targetDate = new Date(excelBaseDate.getTime() + numValue * millisecondsPerDay);
                
                if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() >= 1900 && targetDate.getFullYear() <= 2100) {
                  return normalizeDateString(targetDate.toISOString().split('T')[0]);
                }
              } catch {
                // Si conversion échoue, retourner le texte original
              }
            }
            
            // Retourner le texte tel quel (par exemple "En attente", "Non défini", etc.)
            return stringValue;
          };
          
          // Fonction pour convertir les dates Excel
          const parseExcelDate = (value: any): string => {
            if (!value) return '';
            
            // Si c'est déjà un objet Date (traité par xlsx avec cellDates: true)
            if (value instanceof Date) {
              if (!isNaN(value.getTime()) && value.getFullYear() >= 1900 && value.getFullYear() <= 2100) {
                // Construire la date manuellement pour éviter les décalages de fuseau
                const year = value.getFullYear();
                const month = String(value.getMonth() + 1).padStart(2, '0');
                const day = String(value.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              }
            }
            
            // Si c'est déjà une chaîne de date valide, la retourner
            const stringValue = String(value).trim();
            if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/) || stringValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              return stringValue;
            }
            
            // Si c'est un nombre (date Excel) - fallback
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
              try {
                // Excel compte les jours depuis le 30 décembre 1899
                const excelBaseDate = new Date(1899, 11, 30); // 30 décembre 1899
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const targetDate = new Date(excelBaseDate.getTime() + numValue * millisecondsPerDay);
                
                if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() >= 1900 && targetDate.getFullYear() <= 2100) {
                  // Construire la date manuellement pour éviter les décalages de fuseau
                  const year = targetDate.getFullYear();
                  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                  const day = String(targetDate.getDate()).padStart(2, '0');
                  return `${year}-${month}-${day}`;
                }
              } catch (error) {
                console.warn('Erreur lors de la conversion de date Excel:', value, error);
              }
            }
            
            // Essayer de parser comme date normale
            try {
              const parsedDate = new Date(stringValue);
              if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 1900 && parsedDate.getFullYear() <= 2100) {
                // Construire la date manuellement pour éviter les décalages de fuseau
                const year = parsedDate.getFullYear();
                const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const day = String(parsedDate.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              }
            } catch (error) {
              console.warn('Erreur lors du parsing de date normale:', value, error);
            }
            
            return stringValue; // Retourner la valeur originale si aucune conversion n'est possible
          };
          
          // Parser les données
          const parsedData: any[] = [];
          for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            
            // Ignorer les lignes vides
            if (!row || row.every((cell: any) => !String(cell || '').trim())) {
              continue;
            }
            
            const rowData: any = {};
            
            if (dateIndex >= 0) rowData['LA DATE'] = parseExcelDate(row[dateIndex]);
            if (fournisseurIndex >= 0) rowData['FOURNISSEUR'] = String(row[fournisseurIndex] || '').trim();
            if (montantIndex >= 0) rowData['MONTANT DE CHEQUE'] = String(row[montantIndex] || '').trim();
            if (dateChequeIndex >= 0) rowData['LA DATE DE CHEQUE'] = parseExcelDateOrText(row[dateChequeIndex]);
            if (numeroChequeIndex >= 0) rowData['NUMERO DE CHEQUE'] = String(row[numeroChequeIndex] || '').trim();
            if (validationIndex >= 0) rowData['VALIDATION'] = String(row[validationIndex] || '').trim();
            if (banqueIndex >= 0) rowData['la banque'] = String(row[banqueIndex] || '').trim();
            if (personneIndex >= 0) rowData['personne'] = String(row[personneIndex] || '').trim();
            if (facturesIndex >= 0) rowData['Factures'] = String(row[facturesIndex] || '').trim();
            if (disponibleIndex >= 0) rowData['disponible'] = String(row[disponibleIndex] || '').trim();
            
            parsedData.push(rowData);
          }
          
          if (parsedData.length === 0) {
            reject(new Error('Aucune donnée trouvée dans le fichier'));
            return;
          }
          
          // Valider chaque ligne
          const validatedData = parsedData.map((row, index) => validateImportedRow(row, index));
          resolve(validatedData);
          
        } catch (error: any) {
          reject(new Error(`Erreur lors de l'analyse du fichier: ${error.message}`));
        }
      };
      
      reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
      
      // Lire le fichier selon son type
      if (file.name.toLowerCase().endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  };

  // Prévisualiser les données
  const handlePreview = async () => {
    if (!file) {
      showError('Veuillez sélectionner un fichier');
      return;
    }

    try {
      setImporting(true);
      const data = await parseFile(file);
      setImportedData(data);
      setShowPreview(true);
    } catch (error: any) {
      showError(`Erreur lors de l'analyse du fichier: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Importer les données
  const handleImport = async () => {
    if (!selectedTalon) {
      showError('Veuillez sélectionner un talon à associer');
      return;
    }

    if (importedData.length === 0) {
      showError('Aucune donnée à importer');
      return;
    }

    const validData = importedData.filter(row => row.isValid);
    if (validData.length === 0) {
      showError('Aucune ligne valide à importer');
      return;
    }

    try {
      setImporting(true);
      let successCount = 0;
      let errorCount = 0;

      for (const row of validData) {
        try {
          await createOldTalonCaisse({
            date_paiement: row.date_paiement ?? null,
            fournisseur: row.fournisseur!,
            montant_cheque: row.montant_cheque!,
            date_cheque: row.date_cheque!,
            numero_cheque: row.numero_cheque || null, // Peut être null
            validation: row.validation!,
            banque: row.banque,
            personne: row.personne,
            factures: row.factures,
            disponible: row.disponible,
            id_talon: parseInt(selectedTalon)
          }).unwrap();
          successCount++;
        } catch (error) {
          console.error(`Erreur ligne ${row.rowIndex}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        showSuccess(`${successCount} ancien(s) talon(s) importé(s) avec succès`);
      }
      if (errorCount > 0) {
        showError(`${errorCount} ligne(s) ont échoué lors de l'import`);
      }

      // Réinitialiser
      setFile(null);
      setImportedData([]);
      setShowPreview(false);
      setSelectedTalon('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      showError(`Erreur lors de l'import: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const validRowsCount = importedData.filter(row => row.isValid).length;
  const invalidRowsCount = importedData.filter(row => !row.isValid).length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Import Anciens Talons</h1>
          <p className="text-gray-600 mt-1">Importer les anciens talons caisse depuis un fichier Excel/CSV</p>
        </div>

        {/* Template Download */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📄 Template Excel</h2>
          <p className="text-gray-600 mb-4">
            Téléchargez le template pour voir le format attendu des données.
            Les headers obligatoires sont : LA DATE, FOURNISSEUR, MONTANT DE CHEQUE, LA DATE DE CHEQUE
            <br />
            Headers optionnels : NUMERO DE CHEQUE, VALIDATION, la banque, personne, Factures, disponible
          </p>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={16} />
            Télécharger Template CSV
          </button>
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📤 Sélectionner un fichier</h2>
          
          <div className="flex flex-col gap-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              <p className="text-sm text-gray-500 mt-1">
                Formats acceptés: CSV, Excel (.xlsx, .xls)
              </p>
            </div>

            {/* Sélection du talon */}
            <div>
              <label htmlFor="talon-select" className="block text-sm font-medium text-gray-700 mb-2">
                Talon à associer aux anciens talons importés *
              </label>
              <select
                id="talon-select"
                value={selectedTalon}
                onChange={(e) => setSelectedTalon(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="">Sélectionner un talon</option>
                {talons.map((talon: Talon) => (
                  <option key={talon.id} value={talon.id}>
                    {talon.nom}
                  </option>
                ))}
              </select>
            </div>

            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={16} />
                <span>{file.name}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handlePreview}
                disabled={!file || importing}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Analyse...' : 'Prévisualiser'}
              </button>
              
              {showPreview && (
                <button
                  onClick={handleImport}
                  disabled={importing || !selectedTalon || validRowsCount === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? 'Import...' : `Importer ${validRowsCount} ligne(s)`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && importedData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">👁️ Prévisualisation</h2>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{importedData.length}</div>
                <div className="text-sm text-blue-600">Total lignes</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{validRowsCount}</div>
                <div className="text-sm text-green-600">Lignes valides</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{invalidRowsCount}</div>
                <div className="text-sm text-red-600">Lignes invalides</div>
              </div>
            </div>

            {/* Talon sélectionné */}
            {selectedTalon && (
              <div className="bg-orange-50 p-4 rounded-lg mb-6">
                <div className="text-sm font-medium text-orange-800">
                  Talon sélectionné : {talons.find((t: Talon) => t.id === parseInt(selectedTalon))?.nom}
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ligne</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Paiement</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Chèque</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Chèque</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validation</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banque</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Personne</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factures</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disponible</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Erreurs</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {importedData.map((row, index) => (
                    <tr key={index} className={row.isValid ? 'bg-green-50' : 'bg-red-50'}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.isValid ? (
                          <CheckCircle size={16} className="text-green-600" />
                        ) : (
                          <X size={16} className="text-red-600" />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.rowIndex}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.date_paiement || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.fournisseur || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.montant_cheque || '-'} DH
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.date_cheque || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.numero_cheque || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          row.validation === 'Validé' ? 'bg-green-100 text-green-800' :
                          row.validation === 'En attente' ? 'bg-yellow-100 text-yellow-800' :
                          row.validation === 'Refusé' ? 'bg-orange-100 text-orange-800' :
                          row.validation === 'Annulé' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {row.validation || 'En attente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.banque || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.personne || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.factures || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.disponible || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600">
                        {row.errors && row.errors.length > 0 && (
                          <div className="flex items-start gap-1">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <div>
                              {row.errors.map((error, i) => (
                                <div key={i}>{error}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportOldTalons;
