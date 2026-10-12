import {Composition,Folder} from 'remotion';
import {CatalogVideo} from './Composition';
import {Intro} from './Intro';
import {ProductScene} from './ProductScene';
import {Recap} from './Recap';
import {BoukirCommercial} from './commercial/Commercial';
import {CommercialOpening} from './commercial/Opening';
import {CommercialTools} from './commercial/Tools';
import {CommercialMaterials} from './commercial/Materials';
import {CommercialFinishes} from './commercial/Finishes';
import {CommercialWebsite} from './commercial/Website';
import {CommercialContact} from './commercial/Contact';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="BoukirCommercial" component={BoukirCommercial} durationInFrames={1200} fps={30} width={1548} height={516}/>
      <Folder name="Commercial-Scenes">
        <Composition id="CommercialOpening" component={CommercialOpening} durationInFrames={180} fps={30} width={1548} height={516}/>
        <Composition id="CommercialTools" component={CommercialTools} durationInFrames={210} fps={30} width={1548} height={516}/>
        <Composition id="CommercialMaterials" component={CommercialMaterials} durationInFrames={210} fps={30} width={1548} height={516}/>
        <Composition id="CommercialFinishes" component={CommercialFinishes} durationInFrames={210} fps={30} width={1548} height={516}/>
        <Composition id="CommercialWebsite" component={CommercialWebsite} durationInFrames={210} fps={30} width={1548} height={516}/>
        <Composition id="CommercialContact" component={CommercialContact} durationInFrames={180} fps={30} width={1548} height={516}/>
      </Folder>
      <Composition id="BoukirCatalogue" component={CatalogVideo} durationInFrames={2880} fps={30} width={1548} height={516}/>
      <Folder name="Scenes">
        <Composition id="Introduction" component={Intro} durationInFrames={120} fps={30} width={1548} height={516}/>
        <Composition id="Bioscud" component={ProductScene} defaultProps={{index:0}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="SiliconeColore" component={ProductScene} defaultProps={{index:1}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="TetraFixBlanc" component={ProductScene} defaultProps={{index:2}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="TetraFixCrystal" component={ProductScene} defaultProps={{index:3}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="TetraFixGris" component={ProductScene} defaultProps={{index:4}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="TetraFixNoir" component={ProductScene} defaultProps={{index:5}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="TetraSeal" component={ProductScene} defaultProps={{index:6}} durationInFrames={360} fps={30} width={1548} height={516}/>
        <Composition id="Recapitulatif" component={Recap} durationInFrames={240} fps={30} width={1548} height={516}/>
      </Folder>
    </>
  );
};
