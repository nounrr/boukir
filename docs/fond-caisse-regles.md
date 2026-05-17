# Regles Fond Caisse

## Formule generale

Le calcul journalier du fond de caisse suit cette formule:

`Total du jour = Debut + Entrees - Sorties`

## Definition des champs

### Debut

Le `Debut` d'un jour est:

- le fond de caisse saisi manuellement pour ce jour, si une entree existe dans `fond_caisse_entries`
- sinon, le total final du jour precedent

## Entrees

Les entrees du fond de caisse sont:

1. `Bon comptant paye`
   - source: `bons_comptant`
   - inclus si:
     - `non_paye <> 1`
     - `statut` n'est pas annule
     - `statut <> 'avoir'`

2. `Paiement bon comptant non paye`
   - source: `paiement_boncomptant_nonpaye`
   - inclus selon `date_paiement`
  
3. `Paiement caisse`
   - source: `payments`
   - exclus si:
     - `bon_type = 'Comptant'`
     - `statut` est annule
     - `statut` est refuse
   - inclus si:
     - `type_paiement = 'Client'`
   - inclus aussi si:
     - `type_paiement = 'Fournisseur'`
     - et le paiement est lie a un `Bon Sortie` avec `vendre_au_fournisseur = 1`
     - ou le paiement est lie a un `Avoir` avec `vendre_au_fournisseur = 1`
   - exclus si:
     - `type_paiement = 'Fournisseur'`
     - et `vendre_au_fournisseur = 0`

4. `Avoir charge incluse caisse`
   - source: `bons_charge`
   - inclus si:
     - `inclus_en_caisse = 1`
     - `operation_type = 'avoir'`
     - `statut` n'est pas annule
   - montant retenu:
     - somme des `charge_items.total` si disponible
     - sinon `bons_charge.montant_total`

### Formule des entrees

`Entrees = Bon comptant paye + Paiement bon comptant non paye + Paiement caisse + Avoir charge incluse caisse`

## Sorties

Les sorties du fond de caisse sont:

1. `Charge incluse caisse`
   - source: `bons_charge`
   - inclus si:
     - `inclus_en_caisse = 1`
     - `operation_type = 'charge'`
     - `statut` n'est pas annule
   - montant retenu:
     - somme des `charge_items.total` si disponible
     - sinon `bons_charge.montant_total`

2. `Bon vehicule`
   - source: `bons_vehicule`
   - inclus si:
     - `statut` n'est pas annule

3. `Avoir comptant`
   - source: `avoirs_comptant`
   - inclus si:
     - `statut` n'est pas annule

4. `Transfert vers coffre`
   - source: `fond_caisse_entries`
   - type d'entree: `transfer_to_coffre`
   - effet:
     - le montant sort de la caisse
     - le meme montant entre dans le coffre

### Formule des sorties

`Sorties = Charge incluse caisse + Bon vehicule + Avoir comptant + Transfert vers coffre`

## Formule finale

`Total du jour = Debut + (Bon comptant paye + Paiement bon comptant non paye + Paiement caisse + Avoir charge incluse caisse) - (Charge incluse caisse + Bon vehicule + Avoir comptant + Transfert vers coffre)`

## Regles Coffre

### Debut coffre

Le `Debut coffre` d'un jour est:

- le montant saisi manuellement avec `entry_type = 'coffre_initial'`
- sinon, le total coffre final du jour precedent

### Entrees coffre

Les entrees du coffre sont:

1. `Transfert vers coffre`
   - source: `fond_caisse_entries`
   - type d'entree: `transfer_to_coffre`
   - provenance: montant retire de la caisse

### Sorties coffre

Actuellement aucune sortie coffre n'est geree dans le calcul.

`Sorties coffre = 0`

### Formule coffre

`Total coffre du jour = Debut coffre + Entrees coffre - Sorties coffre`

Donc actuellement:

`Total coffre du jour = Debut coffre + Transfert vers coffre`

## Detail journalier

L'ecran detail journalier affiche les actions par ordre chronologique:

- fond initial
- bons comptant payes
- paiements bon comptant non paye
- paiements caisse
- avoirs charge inclus caisse
- charges incluses caisse
- bons vehicule
- avoirs comptant
- transferts vers coffre

Pour chaque ligne:

- `ENTREE` ajoute le montant au cumul
- `SORTIE` soustrait le montant du cumul

## Resume metier

Le fond de caisse represente uniquement les mouvements qui impactent reellement la caisse liquide du jour.

- un encaissement client entre en caisse
- un paiement comptant valide entre en caisse
- une charge marquee `inclus_en_caisse` sort de la caisse
- un bon vehicule sort de la caisse
- un avoir comptant sort de la caisse
- un transfert vers coffre sort de la caisse et entre dans le coffre
- un paiement fournisseur normal n'entre pas dans la caisse
- un paiement fournisseur n'entre dans la caisse que s'il appartient a un flux `vendre_au_fournisseur = 1`
- le coffre peut avoir un debut manuel propre, independant du debut caisse
