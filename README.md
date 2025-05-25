# carto

Introduction
Les plans 3D sont générés à partir de plans 2D en SVG. Ceux-ci doivent répondre à un format bien spécifique pour être interprétés correctement.
Le SVG peut être généré par n'importe quel moyen, mais pour plus de cohérence ils seront tous édités avec Inkscape, et les instructions sont données ici se basent là-dessus.

Structure du projet

Un dossier par client, avec le nom mapdata-<nom du client>, par exemple mapdata-vermeg. Ce dossier correspondra à un projet GitLab du même nom.

Exception: pour la Poste le dossier et le projet s'appellent laposte-mapdata.


Dans ce dossier, un dossier src.
Dans ce dossier, un dossier par site, avec pour nom le code du site.

Pour la Poste, les codes de site sont fournis par La Poste
Pour les autres clients, utiliser un préfixe court qui indique le client, puis un code court qui indique la ville. S'il y a plusieurs sites dans la même ville, ajouter un autre code court qui indique le site.
Exemples:


VER-PAR = Vermeg Paris

VER-TUN-BIWA = Vermeg Tunis, site Biwa




Dans le dossier de chaque site:

Un fichier SVG par étage, avec le nom du client, le nom de la ville et/ou du site et l'étage

Exemples:

Vermeg Paris RDC.svg
Vermeg Tunis Biwa R+2.svg




Un fichier texte salles-name-to-id (sans extension)



Exemple de structure:
mapdata-vermeg
├── src
    ├── VER-PAR
      	├── Vermeg Paris RDC.svg
      	├── salles-name-to-id
    ├── VER-TUN-BIWA
      	├── Vermeg Tunis Biwa RDC.svg
      	├── Vermeg Tunis Biwa R+1.svg
      	├── salles-name-to-id
    ├── sites-map
map-converter
├── svg-to-json-converter.pl

exemple de commande à exécuter par le script Perl pour la conversion: perl  map-converter/svg-to-json-converter.pl -d "data" "laposte-map-data/src/BRU/Brune R+7.svg"


      
De façon générale:

Le fichier SVG va être lu par un script automatique. Il est donc impératif d’être précis sur les noms, une faute de frappe et le script ne comprendra pas ce qu’on lui donne.
Les styles, couleurs, épaisseurs, remplissages, etc. sont ignorés. On peut donc les utiliser comme on veut pour faciliter l’édition.
L’ordre des groupes/calques ci-dessous n’a pas d’importance
