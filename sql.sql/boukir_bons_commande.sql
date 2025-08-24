-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: boukir
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `bons_commande`
--

DROP TABLE IF EXISTS `bons_commande`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bons_commande` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date_creation` date NOT NULL,
  `fournisseur_id` int DEFAULT NULL,
  `vehicule_id` int DEFAULT NULL,
  `lieu_chargement` varchar(255) DEFAULT NULL,
  `montant_total` decimal(10,2) NOT NULL,
  `statut` enum('En attente','Validé','Livré','Avoir','Facturé','Annulé') DEFAULT 'En attente',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `adresse_livraison` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fournisseur_id` (`fournisseur_id`),
  KEY `vehicule_id` (`vehicule_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `bons_commande_ibfk_1` FOREIGN KEY (`fournisseur_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bons_commande_ibfk_2` FOREIGN KEY (`vehicule_id`) REFERENCES `vehicules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bons_commande_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bons_commande`
--

LOCK TABLES `bons_commande` WRITE;
/*!40000 ALTER TABLE `bons_commande` DISABLE KEYS */;
INSERT INTO `bons_commande` VALUES (1,'2025-08-11',329,NULL,'sOUANI',1200.00,'Avoir',1,'2025-08-13 21:57:54','2025-08-14 15:26:16','mesnana'),(2,'2025-08-14',329,1,'gtfree',33.48,'En attente',1,'2025-08-14 15:25:56','2025-08-14 20:10:44','tanja balia'),(3,'2025-08-11',329,1,'sOUANI',1875.00,'Validé',1,'2025-08-14 15:58:42','2025-08-16 13:36:57','SANIA'),(6,'2025-08-16',345,NULL,'',275.00,'En attente',1,'2025-08-16 19:45:29','2025-08-16 19:45:29',''),(8,'2025-08-19',345,NULL,'',8332.50,'Validé',1,'2025-08-19 16:38:14','2025-08-21 13:55:09',''),(9,'2025-08-19',342,NULL,'',5555.00,'En attente',1,'2025-08-19 19:16:40','2025-08-19 19:16:40',''),(10,'2025-08-20',447,NULL,'',200.00,'Annulé',1,'2025-08-20 13:53:50','2025-08-21 14:02:33',''),(12,'2025-08-23',349,NULL,'',21425.00,'En attente',1,'2025-08-23 18:05:03','2025-08-23 18:05:03',''),(13,'2025-08-23',373,NULL,'',2494.07,'En attente',1,'2025-08-23 18:08:26','2025-08-23 18:08:26','');
/*!40000 ALTER TABLE `bons_commande` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_bc_after_update_stock` AFTER UPDATE ON `bons_commande` FOR EACH ROW BEGIN
  /* Passage vers Validé : entrée en stock */
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite + ci.quantite
    WHERE ci.bon_commande_id = NEW.id;
  END IF;

  /* Retour depuis Validé vers Annulé / Avoir / Refusé : sortie de stock */
  IF OLD.statut = 'Validé' AND NEW.statut IN ('En attente', 'Livré', 'Avoir', 'Facturé', 'Annulé') THEN
    UPDATE products p
    JOIN commande_items ci ON ci.product_id = p.id
    SET p.quantite = p.quantite - ci.quantite
    WHERE ci.bon_commande_id = NEW.id;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-24  1:12:30
