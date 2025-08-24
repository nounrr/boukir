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
-- Table structure for table `avoir_fournisseur_items`
--

DROP TABLE IF EXISTS `avoir_fournisseur_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `avoir_fournisseur_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `avoir_fournisseur_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantite` decimal(10,2) NOT NULL,
  `prix_unitaire` decimal(10,2) NOT NULL,
  `remise_pourcentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `remise_montant` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_afi_av` (`avoir_fournisseur_id`),
  KEY `idx_afi_prod` (`product_id`),
  CONSTRAINT `avoir_fournisseur_items_ibfk_1` FOREIGN KEY (`avoir_fournisseur_id`) REFERENCES `avoirs_fournisseur` (`id`) ON DELETE CASCADE,
  CONSTRAINT `avoir_fournisseur_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `avoir_fournisseur_items`
--

LOCK TABLES `avoir_fournisseur_items` WRITE;
/*!40000 ALTER TABLE `avoir_fournisseur_items` DISABLE KEYS */;
INSERT INTO `avoir_fournisseur_items` VALUES (5,2,8653,2.00,117.50,0.00,0.00,235.00,'2025-08-13 22:29:32'),(6,3,10237,1.00,250.00,0.00,0.00,250.00,'2025-08-14 13:43:30'),(7,3,10170,1.00,850.00,0.00,0.00,850.00,'2025-08-14 13:43:30'),(8,3,9733,1.00,100.00,0.00,0.00,100.00,'2025-08-14 13:43:30'),(9,4,10331,4.00,4.00,0.00,0.00,16.00,'2025-08-19 19:30:39'),(10,5,8414,1.00,100.00,0.00,0.00,100.00,'2025-08-20 13:53:22');
/*!40000 ALTER TABLE `avoir_fournisseur_items` ENABLE KEYS */;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_afi_after_insert_move` AFTER INSERT ON `avoir_fournisseur_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM avoirs_fournisseur WHERE id = NEW.avoir_fournisseur_id) = 'Validé' THEN
    UPDATE products SET quantite = quantite + NEW.quantite
    WHERE id = NEW.product_id;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_afi_after_update_move` AFTER UPDATE ON `avoir_fournisseur_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM avoirs_fournisseur WHERE id = NEW.avoir_fournisseur_id) = 'Validé' THEN
    IF NEW.product_id = OLD.product_id THEN
      UPDATE products
      SET quantite = quantite + (NEW.quantite - OLD.quantite)
      WHERE id = NEW.product_id;
    ELSE
      UPDATE products SET quantite = quantite - OLD.quantite WHERE id = OLD.product_id;
      UPDATE products SET quantite = quantite + NEW.quantite WHERE id = NEW.product_id;
    END IF;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_afi_after_delete_restore` AFTER DELETE ON `avoir_fournisseur_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM avoirs_fournisseur WHERE id = OLD.avoir_fournisseur_id) = 'Validé' THEN
    UPDATE products SET quantite = quantite - OLD.quantite
    WHERE id = OLD.product_id;
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
