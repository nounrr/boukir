import React from 'react';
import DesktopBonPrintModal from './DesktopBonPrintModal';
import MobileBonPrintModal from './MobileBonPrintModal';
import { useMobilePrintModal } from '../hooks/useMobilePrintModal';
import { useGetContactQuery } from '../store/api/contactsApi';

type Props = React.ComponentProps<typeof DesktopBonPrintModal>;

const positiveId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
};

/** Le contact passé par l'écran appelant est-il déjà complet pour l'impression ? */
const isComplete = (contact: any, id: number) =>
  Boolean(contact && positiveId(contact.id) === id && (contact.telephone || contact.adresse || contact.societe));

/**
 * Point d'entrée commun de toutes les impressions de bons.
 *
 * Les écrans appelants retrouvent le client dans un annuaire en mémoire, qui peut être
 * vide (non chargé pendant l'impression) ou ne pas contenir le contact (clients « charge »,
 * contacts archivés). On recharge alors la fiche par son identifiant, pour que le nom et
 * les informations du client apparaissent sur tous les bons.
 */
const BonPrintModal: React.FC<Props> = (props) => {
  const isMobile = useMobilePrintModal();
  const bon: any = props.bon;
  const clientId = positiveId(bon?.client_id);
  const fournisseurId = positiveId(bon?.fournisseur_id);
  const needClient = props.isOpen && clientId > 0 && !isComplete(props.client, clientId);
  const needFournisseur = props.isOpen && fournisseurId > 0 && !isComplete(props.fournisseur, fournisseurId);

  const { data: fetchedClient } = useGetContactQuery(clientId, { skip: !needClient });
  const { data: fetchedFournisseur } = useGetContactQuery(fournisseurId, { skip: !needFournisseur });

  const client = needClient && fetchedClient ? ({ ...(props.client || {}), ...fetchedClient } as any) : props.client;
  const fournisseur = needFournisseur && fetchedFournisseur
    ? ({ ...(props.fournisseur || {}), ...fetchedFournisseur } as any)
    : props.fournisseur;

  const resolved = { ...props, client, fournisseur };
  return isMobile ? <MobileBonPrintModal {...resolved} /> : <DesktopBonPrintModal {...resolved} />;
};

export default BonPrintModal;
