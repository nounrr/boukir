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
-- Table structure for table `bons_comptant`
--

DROP TABLE IF EXISTS `bons_comptant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bons_comptant` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date_creation` date NOT NULL,
  `client_id` int DEFAULT NULL,
  `client_nom` varchar(255) DEFAULT NULL,
  `vehicule_id` int DEFAULT NULL,
  `lieu_chargement` varchar(255) DEFAULT NULL,
  `montant_total` decimal(10,2) NOT NULL,
  `statut` enum('En attente','Validé','Livré','Payé','Avoir','Annulé') DEFAULT 'En attente',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `adresse_livraison` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  KEY `vehicule_id` (`vehicule_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `bons_comptant_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bons_comptant_ibfk_2` FOREIGN KEY (`vehicule_id`) REFERENCES `vehicules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bons_comptant_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bons_comptant`
--

LOCK TABLES `bons_comptant` WRITE;
/*!40000 ALTER TABLE `bons_comptant` DISABLE KEYS */;
INSERT INTO `bons_comptant` VALUES (1,'2025-08-12',NULL,NULL,1,'',18.13,'En attente',1,'2025-08-13 22:28:45','2025-08-13 22:28:49',NULL),(2,'2025-08-14',NULL,NULL,1,'Boukir Kharba',225.00,'En attente',1,'2025-08-14 15:28:07','2025-08-14 15:28:07','SANIA'),(3,'2025-08-14',5,'MR MOHAMED MAKHOKH (VILATE)',NULL,'boukirckharba',487.50,'Annulé',1,'2025-08-14 20:35:06','2025-08-21 13:06:19','Tanja balia '),(5,'2025-08-15',NULL,NULL,NULL,NULL,200.00,'En attente',1,'2025-08-15 22:04:38','2025-08-15 22:04:38',NULL),(6,'2025-08-16',441,'Nom CLIENT MEDD',NULL,'',100.00,'En attente',1,'2025-08-16 16:15:33','2025-08-21 13:06:19',''),(8,'2025-08-19',NULL,NULL,NULL,'',122210.00,'En attente',1,'2025-08-19 19:01:21','2025-08-19 19:01:21',''),(9,'2025-08-19',NULL,NULL,NULL,'',17094.00,'En attente',1,'2025-08-19 19:02:40','2025-08-19 19:02:40',''),(10,'2025-08-19',NULL,NULL,NULL,'',777.00,'En attente',1,'2025-08-19 19:02:59','2025-08-19 19:02:59',''),(11,'2025-08-19',NULL,NULL,NULL,NULL,200.00,'En attente',1,'2025-08-19 19:31:12','2025-08-19 19:31:12',NULL),(14,'2025-08-20',NULL,NULL,NULL,'',3877.50,'En attente',2,'2025-08-20 18:25:41','2025-08-20 18:25:41',''),(15,'2025-08-21',NULL,'TAWFIK BOUKIR',3,'',44.00,'En attente',2,'2025-08-21 13:08:10','2025-08-21 13:08:10','');
/*!40000 ALTER TABLE `bons_comptant` ENABLE KEYS */;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_bcpt_after_update_move_stock` AFTER UPDATE ON `bons_comptant` FOR EACH ROW BEGIN
  -- Validation => sortie de stock
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM comptant_items
      WHERE bon_comptant_id = NEW.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite - x.q;
  END IF;

  -- Retour depuis Validé => on remet le stock
  IF OLD.statut = 'Validé' AND NEW.statut IN ('En attente', 'Livré', 'Payé', 'Avoir', 'Annulé') THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM comptant_items
      WHERE bon_comptant_id = NEW.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite + x.q;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_bcpt_after_delete_restore` AFTER DELETE ON `bons_comptant` FOR EACH ROW BEGIN
  IF OLD.statut = 'Validé' THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM comptant_items
      WHERE bon_comptant_id = OLD.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite + x.q;
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
