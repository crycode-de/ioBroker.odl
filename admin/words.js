/* global systemDictionary:true */
/* eslint-disable quotes */
'use strict';

systemDictionary = {
  "Past Hours": {
    "en": "Past Hours",
    "de": "Vergangene Stunden",
    "ru": "Прошлые часы",
    "pt": "Horas passadas",
    "nl": "Afgelopen uren",
    "fr": "Heures passées",
    "it": "Ore passate",
    "es": "Horas pasadas",
    "pl": "Ostatnie godziny",
    "zh-cn": "过去的时间"
  },

  "Hours in the past to load from the server. 48h are recommended to get data even if a measuring point is currently unavailable. To log historical data you have to enable a history adapter for each data object.": {
    "en": "Hours in the past to load from the server. 48h are recommended to get data even if a measuring point is currently unavailable. To log historical data you have to enable a history adapter for each data object.",
    "de": "Vergangene Stunden, die vom Server geladen werden. Es wird empfohlen, die Daten der letzten 48 Stunden abzurufen, um auch Daten zu erhalten, wenn eine Messstelle keine aktuellen Daten liefert. Um Verlaufsdaten zu protokollieren, muss für das jeweilige Datenobjekt einen Verlaufsadapter aktiviert werden. Gegebenenfalls im Verlauf fehlende Daten werden entsprechend nachgetragen.",
    "ru": "Часы в прошлом, чтобы загрузить с сервера. Рекомендуется получать данные в течение 48 часов, даже если точка измерения в данный момент недоступна. Для регистрации исторических данных необходимо включить адаптер истории для каждого объекта данных.",
    "pt": "Horas no passado para carregar do servidor. Recomenda-se 48h para obter dados, mesmo que um ponto de medição não esteja disponível no momento. Para registrar dados históricos, é necessário ativar um adaptador de histórico para cada objeto de dados.",
    "nl": "Uren in het verleden om te laden vanaf de server. 48 uur wordt aanbevolen om gegevens te verkrijgen, zelfs als een meetpunt momenteel niet beschikbaar is. Om historische gegevens te loggen, moet u een geschiedenisadapter inschakelen voor elk gegevensobject.",
    "fr": "Heures dans le passé pour charger à partir du serveur. 48h sont recommandées pour obtenir des données même si un point de mesure est actuellement indisponible. Pour consigner les données historiques, vous devez activer un adaptateur d’historique pour chaque objet de données.",
    "it": "Ore passate da caricare dal server. Si consigliano 48 ore per ottenere dati anche se un punto di misurazione non è attualmente disponibile. Per registrare i dati storici è necessario abilitare un adattatore cronologico per ciascun oggetto dati.",
    "es": "Horas en el pasado para cargar desde el servidor. Se recomiendan 48h para obtener datos incluso si un punto de medición no está disponible actualmente. Para registrar datos históricos, debe habilitar un adaptador de historial para cada objeto de datos.",
    "pl": "Godziny w przeszłości, aby załadować z serwera. Zaleca się 48 godzin, aby uzyskać dane, nawet jeśli punkt pomiarowy jest obecnie niedostępny. Aby rejestrować dane historyczne, należy włączyć adapter historii dla każdego obiektu danych.",
    "zh-cn": "过去几个小时从服务器加载。即使当前没有测量点，也建议使用48h来获取数据。要记录历史数据，您必须为每个数据对象启用一个历史适配器。"
  },

  "Measuring points": {
    "en": "Measuring points",
    "de": "Messstellen",
    "ru": "Измерительные точки",
    "pt": "Pontos de medição",
    "nl": "Meetpunten",
    "fr": "Points de mesure",
    "it": "Punti di misurazione",
    "es": "Puntos de medición",
    "pl": "Punkty pomiarowe",
    "zh-cn": "测量点"
  },

  "Enter one or more measuring points to load data for. When you type at least two chars, an autocomplete will be done with the currently active measuring points from the BfS. Also locality codes of currently inactive measuring points may be added.": {
    "en": "Enter one or more measuring points to load data for. When you type at least two chars, an autocomplete will be done with the currently active measuring points from the BfS. You may add one or more measuring points. Also locality codes of currently inactive measuring points may be added.",
    "de": "Eine oder mehrere Messstellen, für die Daten geladen werden sollen. Bei Eingabe von mindestens zwei Zeichen erfolgt eine Autovervollständigung auf Grundlage der aktuell aktiven Messstellen des BfS. Es können auch Ortscodes von derzeit inaktiven Messpunkten hinzugefügt werden.",
    "ru": "Введите одну или несколько точек измерения для загрузки данных. Когда вы наберете как минимум два символа, будет выполнено автозаполнение с активными в данный момент точками измерения от BfS. Также могут быть добавлены коды местностей в настоящее время неактивных точек измерения.",
    "pt": "Insira um ou mais pontos de medição para os quais carregar dados. Quando você digita pelo menos dois caracteres, um preenchimento automático será feito com os pontos de medição ativos no momento do BfS. Também podem ser adicionados códigos de localidade dos pontos de medição atualmente inativos.",
    "nl": "Voer een of meer meetpunten in om gegevens voor te laden. Wanneer u ten minste twee tekens typt, wordt een autoaanvulling uitgevoerd met de momenteel actieve meetpunten van de BfS. Ook plaatscodes van momenteel inactieve meetpunten kunnen worden toegevoegd.",
    "fr": "Entrez un ou plusieurs points de mesure pour lesquels charger des données. Lorsque vous tapez au moins deux caractères, une saisie semi-automatique est effectuée avec les points de mesure actuellement actifs du BfS. Des codes de localité des points de mesure actuellement inactifs peuvent également être ajoutés.",
    "it": "Immettere uno o più punti di misurazione per cui caricare i dati. Quando si digitano almeno due caratteri, verrà eseguito un completamento automatico con i punti di misurazione attualmente attivi dal BfS. Inoltre, possono essere aggiunti codici di località dei punti di misurazione attualmente inattivi.",
    "es": "Ingrese uno o más puntos de medición para cargar datos. Cuando escriba al menos dos caracteres, se realizará un autocompletado con los puntos de medición actualmente activos del BfS. También se pueden agregar códigos de localidad de puntos de medición actualmente inactivos.",
    "pl": "Wprowadź co najmniej jeden punkt pomiarowy, dla którego chcesz załadować dane. Po wpisaniu co najmniej dwóch znaków, autouzupełnianie zostanie wykonane z aktualnie aktywnymi punktami pomiarowymi z BfS. Można również dodać kody lokalizacji aktualnie nieaktywnych punktów pomiarowych.",
    "zh-cn": "输入一个或多个测量点以加载数据。当您键入至少两个字符时，将使用BfS中当前活动的测量点来完成自动完成。还可以添加当前不活动的测量点的位置代码。"
  },

  "Data": {
    "en": "Data",
    "de": "Daten",
    "ru": "Данные",
    "pt": "Dados",
    "nl": "Gegevens",
    "fr": "Les données",
    "it": "Dati",
    "es": "Datos",
    "pl": "Dane",
    "zh-cn": "数据"
  },

  "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)": {
    "en": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "de": "Bundesamt für Strahlenschutz (BfS)",
    "ru": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "pt": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "nl": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "fr": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "it": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "es": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "pl": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)",
    "zh-cn": "Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)"
  },

  "Data licence Germany – attribution – Version 2.0": {
    "en": "Data licence Germany – attribution – Version 2.0",
    "de": "Datenlizenz Deutschland – Namensnennung – Version 2.0",
    "ru": "Data licence Germany – attribution – Version 2.0",
    "pt": "Data licence Germany – attribution – Version 2.0",
    "nl": "Data licence Germany – attribution – Version 2.0",
    "fr": "Data licence Germany – attribution – Version 2.0",
    "it": "Data licence Germany – attribution – Version 2.0",
    "es": "Data licence Germany – attribution – Version 2.0",
    "pl": "Data licence Germany – attribution – Version 2.0",
    "zh-cn": "Data licence Germany – attribution – Version 2.0"
  },

  "Enter a locality code or name": {
    "en": "Enter a locality code or name",
    "de": "Ortscode oder Ortsnamen eingeben",
    "ru": "Введите код местности или название",
    "pt": "Digite um código ou nome de localidade",
    "nl": "Voer een plaatscode of een naam in",
    "fr": "Entrez un code de localité ou un nom",
    "it": "Inserisci un codice località o un nome",
    "es": "Ingrese un código de localidad o nombre",
    "pl": "Wpisz kod miejscowości lub nazwę",
    "zh-cn": "输入地区代码或名称"
  },

  "+Locality": {
    "en": "+Locality",
    "de": "+Ort",
    "ru": "+Местность",
    "pt": "+Localidade",
    "nl": "+Plaats",
    "fr": "+Localité",
    "it": "+Località",
    "es": "+Localidad",
    "pl": "+Lokalizacja",
    "zh-cn": "+地区"
  },

  "Error loading currently available measuring points from the BfS server! Autocomplete and displaying names will not work.": {
    "en": "Error loading currently available measuring points from the BfS server! Autocomplete and displaying names will not work.",
    "de": "Fehler beim Laden der aktuell verfügbaren Messstellen vom BfS-Server! Die Autovervollständigung und das Anzeigen von Namen werden nicht funktionieren.",
    "ru": "Ошибка загрузки доступных в настоящее время точек измерения с сервера BfS! Автозаполнение и отображение имен не будут работать.",
    "pt": "Erro ao carregar pontos de medição disponíveis no momento no servidor BfS! O preenchimento automático e a exibição de nomes não funcionarão.",
    "nl": "Fout bij het laden van momenteel beschikbare meetpunten van de BfS-server! Automatisch aanvullen en het weergeven van namen werkt niet.",
    "fr": "Erreur lors du chargement des points de mesure actuellement disponibles à partir du serveur BfS! La saisie semi-automatique et l'affichage des noms ne fonctionneront pas.",
    "it": "Errore durante il caricamento dei punti di misurazione attualmente disponibili dal server BfS! Il completamento automatico e la visualizzazione dei nomi non funzioneranno.",
    "es": "¡Error al cargar los puntos de medición disponibles actualmente desde el servidor BfS! Autocompletar y mostrar nombres no funcionará.",
    "pl": "Błąd ładowania aktualnie dostępnych punktów pomiarowych z serwera BfS! Autouzupełnianie i wyświetlanie nazw nie będzie działać.",
    "zh-cn": "从BfS服务器加载当前可用的测量点时出错！自动完成和显示名称将不起作用。"
  },

  "Unexpected answer from BfS server! Autocomplete and displaying names will not work.": {
    "en": "Unexpected answer from BfS server! Autocomplete and displaying names will not work.",
    "de": "Unerwartete Antwort vom BfS-Server! Die Autovervollständigung und das Anzeigen von Namen werden nicht funktionieren.",
    "ru": "Неожиданный ответ от BfS сервера! Автозаполнение и отображение имен не будут работать.",
    "pt": "Resposta inesperada do servidor BfS! O preenchimento automático e a exibição de nomes não funcionarão.",
    "nl": "Onverwacht antwoord van BfS-server! Automatisch aanvullen en het weergeven van namen werkt niet.",
    "fr": "Réponse inattendue du serveur BfS! La saisie semi-automatique et l'affichage des noms ne fonctionneront pas.",
    "it": "Risposta imprevista dal server BfS! Il completamento automatico e la visualizzazione dei nomi non funzioneranno.",
    "es": "¡Respuesta inesperada del servidor BfS! Autocompletar y mostrar nombres no funcionará.",
    "pl": "Nieoczekiwana odpowiedź z serwera BfS! Autouzupełnianie i wyświetlanie nazw nie będzie działać.",
    "zh-cn": "来自BfS服务器的意外答案！自动完成和显示名称将不起作用。"
  }
};
