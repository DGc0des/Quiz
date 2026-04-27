import { Question, Category, Points } from '../types';

export const questions: Question[] = [
  // ── Ιστορία ──
  { id: 'hist_1_01', category: 'Ιστορία', difficulty: 1, text: 'Ποιο ήταν το αρχαίο όνομα της Κωνσταντινούπολης;', options: ['Αλεξάνδρεια', 'Βυζάντιο', 'Θεσσαλονίκη', 'Αντιόχεια'], correctIndex: 1 },
  { id: 'hist_1_02', category: 'Ιστορία', difficulty: 1, text: 'Ποιος ήταν ο πρώτος Πρωθυπουργός της σύγχρονης Ελλάδας;', options: ['Ελευθέριος Βενιζέλος', 'Ιωάννης Καποδίστριας', 'Αλέξανδρος Μαυροκορδάτος', 'Κωνσταντίνος Κανάρης'], correctIndex: 2 },
  { id: 'hist_1_03', category: 'Ιστορία', difficulty: 1, text: 'Σε ποια χρονιά ξεκίνησε η Ελληνική Επανάσταση;', options: ['1815', '1821', '1827', '1830'], correctIndex: 1 },
  { id: 'hist_1_04', category: 'Ιστορία', difficulty: 1, text: 'Ποια αρχαία πόλη ήταν γνωστή για τους πολεμιστές της;', options: ['Αθήνα', 'Κόρινθος', 'Σπάρτη', 'Θήβα'], correctIndex: 2 },
  { id: 'hist_1_05', category: 'Ιστορία', difficulty: 1, text: 'Ποιος Έλληνας φιλόσοφος ήταν δάσκαλος του Αλεξάνδρου;', options: ['Πλάτωνας', 'Σωκράτης', 'Αριστοτέλης', 'Επίκουρος'], correctIndex: 2 },
  { id: 'hist_2_01', category: 'Ιστορία', difficulty: 2, text: 'Ποια μάχη θεωρείται η αρχή της κλασικής περιόδου στην Αθήνα;', options: ['Σαλαμίνα', 'Θερμοπύλες', 'Μαραθώνας', 'Πλαταιές'], correctIndex: 2 },
  { id: 'hist_2_02', category: 'Ιστορία', difficulty: 2, text: 'Ποια χρονιά ελευθερώθηκε η Θεσσαλονίκη από την Ελλάδα;', options: ['1908', '1912', '1919', '1923'], correctIndex: 1 },
  { id: 'hist_2_03', category: 'Ιστορία', difficulty: 2, text: 'Ποιος ήταν ο τελευταίος αυτοκράτορας του Βυζαντίου;', options: ['Αλέξιος Κομνηνός', 'Ιωάννης Παλαιολόγος', 'Κωνσταντίνος ΙΑ΄ Παλαιολόγος', 'Μανουήλ Β΄'], correctIndex: 2 },
  { id: 'hist_2_04', category: 'Ιστορία', difficulty: 2, text: 'Ποιος Έλληνας ήρωας εμφανίζεται στην Ιλιάδα ως ο ισχυρότερος πολεμιστής;', options: ['Οδυσσέας', 'Αγαμέμνονας', 'Αχιλλέας', 'Αίας'], correctIndex: 2 },
  { id: 'hist_2_05', category: 'Ιστορία', difficulty: 2, text: 'Πότε ιδρύθηκε η Αθηναϊκή Δημοκρατία από τον Κλεισθένη;', options: ['508 π.Χ.', '490 π.Χ.', '461 π.Χ.', '429 π.Χ.'], correctIndex: 0 },
  { id: 'hist_3_01', category: 'Ιστορία', difficulty: 3, text: 'Σε ποιο έτος υπογράφηκε η Συνθήκη της Λωζάνης;', options: ['1919', '1920', '1923', '1925'], correctIndex: 2 },
  { id: 'hist_3_02', category: 'Ιστορία', difficulty: 3, text: 'Ποιος είναι ο συγγραφέας της «Ελληνικής Νομαρχίας»;', options: ['Ρήγας Φεραίος', 'Ανώνυμος ο Έλλην', 'Αδαμάντιος Κοραής', 'Νεόφυτος Δούκας'], correctIndex: 1 },
  { id: 'hist_3_03', category: 'Ιστορία', difficulty: 3, text: 'Σε ποια μάχη νίκησε ο Μέγας Αλέξανδρος οριστικά τον Δαρείο Γ΄;', options: ['Γρανικός', 'Ισσός', 'Γαυγάμηλα', 'Υδάσπης'], correctIndex: 2 },
  { id: 'hist_3_04', category: 'Ιστορία', difficulty: 3, text: 'Ποια ήταν η πρώτη πρωτεύουσα του ελληνικού κράτους;', options: ['Αθήνα', 'Ναύπλιο', 'Πάτρα', 'Μεσολόγγι'], correctIndex: 1 },
  { id: 'hist_3_05', category: 'Ιστορία', difficulty: 3, text: 'Ποιο έτος αναγορεύτηκε Βασιλιάς της Ελλάδας ο Όθων;', options: ['1827', '1830', '1832', '1836'], correctIndex: 2 },

  // ── Επιστήμη ──
  { id: 'sci_1_01', category: 'Επιστήμη', difficulty: 1, text: 'Ποιο χημικό στοιχείο έχει σύμβολο O;', options: ['Χρυσός', 'Σίδηρος', 'Οξυγόνο', 'Ωσμός'], correctIndex: 2 },
  { id: 'sci_1_02', category: 'Επιστήμη', difficulty: 1, text: 'Πόσα πόδια έχει μια αράχνη;', options: ['4', '6', '8', '10'], correctIndex: 2 },
  { id: 'sci_1_03', category: 'Επιστήμη', difficulty: 1, text: 'Ποιο είναι το πιο άφθονο αέριο στην ατμόσφαιρα;', options: ['Οξυγόνο', 'Άζωτο', 'Διοξείδιο του άνθρακα', 'Αργόν'], correctIndex: 1 },
  { id: 'sci_1_04', category: 'Επιστήμη', difficulty: 1, text: 'Πόσα χρόνια χρειάζεται η Γη να κάνει μια πλήρη περιστροφή γύρω από τον Ήλιο;', options: ['24 ώρες', '28 μέρες', '365 μέρες', '100 χρόνια'], correctIndex: 2 },
  { id: 'sci_1_05', category: 'Επιστήμη', difficulty: 1, text: 'Ποιο είναι το μεγαλύτερο πλανήτης του ηλιακού μας συστήματος;', options: ['Σάτουρνος', 'Δίας', 'Ουρανός', 'Ποσειδών'], correctIndex: 1 },
  { id: 'sci_2_01', category: 'Επιστήμη', difficulty: 2, text: 'Ποια είναι η μονάδα μέτρησης της ηλεκτρικής αντίστασης;', options: ['Βολτ', 'Αμπέρ', 'Ωμ', 'Βατ'], correctIndex: 2 },
  { id: 'sci_2_02', category: 'Επιστήμη', difficulty: 2, text: 'Ποιο οξύ υπάρχει στα εσπεριδοειδή;', options: ['Κιτρικό οξύ', 'Οξικό οξύ', 'Σαλικυλικό οξύ', 'Γαλακτικό οξύ'], correctIndex: 0 },
  { id: 'sci_2_03', category: 'Επιστήμη', difficulty: 2, text: 'Ποιος ανακάλυψε την πενικιλίνη;', options: ['Louis Pasteur', 'Alexander Fleming', 'Marie Curie', 'Robert Koch'], correctIndex: 1 },
  { id: 'sci_2_04', category: 'Επιστήμη', difficulty: 2, text: 'Ποιο είναι το ταχύτερο ζώο στον κόσμο;', options: ['Λέαινα', 'Αετός', 'Χιτάχ', 'Δελφίνι'], correctIndex: 2 },
  { id: 'sci_2_05', category: 'Επιστήμη', difficulty: 2, text: 'Τι μετράει το σεισμογράφος;', options: ['Θερμοκρασία', 'Σεισμικά κύματα', 'Ατμοσφαιρική πίεση', 'Υγρασία'], correctIndex: 1 },
  { id: 'sci_3_01', category: 'Επιστήμη', difficulty: 3, text: 'Ποιος νόμος εκφράζει τη σχέση PV = nRT;', options: ['Νόμος Boyle', 'Νόμος Charles', 'Νόμος ιδανικού αερίου', "Νόμος Gay-Lussac"], correctIndex: 2 },
  { id: 'sci_3_02', category: 'Επιστήμη', difficulty: 3, text: 'Ποιος είναι ο ατομικός αριθμός του χρυσού;', options: ['47', '79', '82', '92'], correctIndex: 1 },
  { id: 'sci_3_03', category: 'Επιστήμη', difficulty: 3, text: 'Ποια θεωρία του Einstein αναφέρεται στη σχέση Ε=mc²;', options: ['Γενική Θεωρία Σχετικότητας', 'Ειδική Θεωρία Σχετικότητας', 'Κβαντική Θεωρία', 'Θεωρία Χορδών'], correctIndex: 1 },
  { id: 'sci_3_04', category: 'Επιστήμη', difficulty: 3, text: 'Ποιο είναι το σκληρότερο φυσικό υλικό;', options: ['Χαλαζίας', 'Τιτάνιο', 'Διαμάντι', 'Κορούνδιο'], correctIndex: 2 },
  { id: 'sci_3_05', category: 'Επιστήμη', difficulty: 3, text: 'Πόσα ζεύγη χρωμοσωμάτων έχει ο άνθρωπος;', options: ['22', '23', '24', '46'], correctIndex: 1 },

  // ── Αθλητισμός ──
  { id: 'sport_1_01', category: 'Αθλητισμός', difficulty: 1, text: 'Πόσοι παίκτες αγωνίζονται σε μια ομάδα μπάσκετ;', options: ['4', '5', '6', '7'], correctIndex: 1 },
  { id: 'sport_1_02', category: 'Αθλητισμός', difficulty: 1, text: 'Πόσο διαρκεί ένας αγώνας ποδοσφαίρου;', options: ['60 λεπτά', '80 λεπτά', '90 λεπτά', '120 λεπτά'], correctIndex: 2 },
  { id: 'sport_1_03', category: 'Αθλητισμός', difficulty: 1, text: 'Πόσα σετ παίζονται σε αγώνα τένις Grand Slam ανδρών;', options: ['3', '5', '7', '4'], correctIndex: 1 },
  { id: 'sport_1_04', category: 'Αθλητισμός', difficulty: 1, text: 'Ποια χώρα κέρδισε το Παγκόσμιο Κύπελλο Ποδοσφαίρου το 2018;', options: ['Βραζιλία', 'Γερμανία', 'Γαλλία', 'Αργεντινή'], correctIndex: 2 },
  { id: 'sport_1_05', category: 'Αθλητισμός', difficulty: 1, text: 'Ποιο άθλημα παίζεται στο Wimbledon;', options: ['Squash', 'Τένις', 'Badminton', 'Πινγκ-πονγκ'], correctIndex: 1 },
  { id: 'sport_2_01', category: 'Αθλητισμός', difficulty: 2, text: 'Σε ποια πόλη διεξήχθησαν οι πρώτοι Σύγχρονοι Ολυμπιακοί Αγώνες;', options: ['Παρίσι', 'Λονδίνο', 'Αθήνα', 'Ρώμη'], correctIndex: 2 },
  { id: 'sport_2_02', category: 'Αθλητισμός', difficulty: 2, text: 'Πόσες φορές έχει κερδίσει η Ελλάδα το UEFA Euro;', options: ['0', '1', '2', '3'], correctIndex: 1 },
  { id: 'sport_2_03', category: 'Αθλητισμός', difficulty: 2, text: 'Ποια ελληνική ομάδα μπάσκετ έχει κερδίσει την Euroleague;', options: ['Ολυμπιακός', 'Παναθηναϊκός', 'ΠΑΟΚ', 'ΑΕΚ'], correctIndex: 1 },
  { id: 'sport_2_04', category: 'Αθλητισμός', difficulty: 2, text: 'Σε ποιο άθλημα αγωνίζεται ο Νοβάκ Τζόκοβιτς;', options: ['Golf', 'Τένις', 'Badminton', 'Squash'], correctIndex: 1 },
  { id: 'sport_2_05', category: 'Αθλητισμός', difficulty: 2, text: 'Ποιος κατέχει το ρεκόρ σε χρυσά ολυμπιακά μετάλλια;', options: ['Carl Lewis', 'Usain Bolt', 'Michael Phelps', 'Mark Spitz'], correctIndex: 2 },
  { id: 'sport_3_01', category: 'Αθλητισμός', difficulty: 3, text: 'Ποιος κρατά το παγκόσμιο ρεκόρ στα 100 μέτρα ανδρών;', options: ['Usain Bolt', 'Yohan Blake', 'Tyson Gay', 'Noah Lyles'], correctIndex: 0 },
  { id: 'sport_3_02', category: 'Αθλητισμός', difficulty: 3, text: 'Ποιο έτος ίδρύθηκε η UEFA;', options: ['1948', '1954', '1960', '1966'], correctIndex: 1 },
  { id: 'sport_3_03', category: 'Αθλητισμός', difficulty: 3, text: 'Πόσα χρυσά μετάλλια κέρδισε η Ελλάδα στους Ολυμπιακούς του 2004;', options: ['4', '6', '16', '3'], correctIndex: 1 },
  { id: 'sport_3_04', category: 'Αθλητισμός', difficulty: 3, text: 'Ποιος Έλληνας αθλητής κέρδισε χρυσό μετάλλιο στο άλμα εις ύψος στους Ολυμπιακούς Αγώνες;', options: ['Νίκος Κακλαμανάκης', 'Κώστας Κεντέρης', 'Δημήτρης Χονδρόπουλος', 'Τάκης Δήμας'], correctIndex: 3 },
  { id: 'sport_3_05', category: 'Αθλητισμός', difficulty: 3, text: 'Σε ποια χρονιά ίδρύθηκε η FIFA;', options: ['1900', '1904', '1908', '1912'], correctIndex: 1 },

  // ── Γεωγραφία ──
  { id: 'geo_1_01', category: 'Γεωγραφία', difficulty: 1, text: 'Ποια είναι η πρωτεύουσα της Γαλλίας;', options: ['Βερσαλλίες', 'Μασσαλία', 'Παρίσι', 'Λυών'], correctIndex: 2 },
  { id: 'geo_1_02', category: 'Γεωγραφία', difficulty: 1, text: 'Ποιο είναι το μεγαλύτερο νησί της Ελλάδας;', options: ['Ρόδος', 'Λέσβος', 'Κέρκυρα', 'Κρήτη'], correctIndex: 3 },
  { id: 'geo_1_03', category: 'Γεωγραφία', difficulty: 1, text: 'Ποιο βουνό είναι το ψηλότερο της Ελλάδας;', options: ['Παρνασσός', 'Ολύμπου', 'Ψηλορείτης', 'Γκιώνα'], correctIndex: 1 },
  { id: 'geo_1_04', category: 'Γεωγραφία', difficulty: 1, text: 'Σε ποια ήπειρο βρίσκεται η Αίγυπτος;', options: ['Ασία', 'Αφρική', 'Ευρώπη', 'Μέση Ανατολή'], correctIndex: 1 },
  { id: 'geo_1_05', category: 'Γεωγραφία', difficulty: 1, text: 'Ποιος ωκεανός είναι ο μεγαλύτερος;', options: ['Ατλαντικός', 'Ινδικός', 'Ειρηνικός', 'Αρκτικός'], correctIndex: 2 },
  { id: 'geo_2_01', category: 'Γεωγραφία', difficulty: 2, text: 'Ποιος ποταμός είναι ο μακρύτερος στον κόσμο;', options: ['Αμαζόνιος', 'Νείλος', 'Γιανγκτσέ', 'Μισισιπής'], correctIndex: 1 },
  { id: 'geo_2_02', category: 'Γεωγραφία', difficulty: 2, text: 'Ποια χώρα έχει τον μεγαλύτερο πληθυσμό στον κόσμο;', options: ['ΗΠΑ', 'Ινδία', 'Κίνα', 'Βραζιλία'], correctIndex: 1 },
  { id: 'geo_2_03', category: 'Γεωγραφία', difficulty: 2, text: 'Σε ποια χώρα βρίσκεται ο ποταμός Αμαζόνιος;', options: ['Αργεντινή', 'Κολομβία', 'Βραζιλία', 'Περού'], correctIndex: 2 },
  { id: 'geo_2_04', category: 'Γεωγραφία', difficulty: 2, text: 'Ποια είναι η μικρότερη χώρα στον κόσμο;', options: ['Μονακό', 'Σαν Μαρίνο', 'Βατικανό', 'Λιχτενστάιν'], correctIndex: 2 },
  { id: 'geo_2_05', category: 'Γεωγραφία', difficulty: 2, text: 'Ποια πόλη είναι η πρωτεύουσα της Αυστραλίας;', options: ['Σίδνεϊ', 'Μελβούρνη', 'Μπρίσμπεϊν', 'Καμπέρα'], correctIndex: 3 },
  { id: 'geo_3_01', category: 'Γεωγραφία', difficulty: 3, text: 'Ποια χώρα έχει τα περισσότερα χερσαία σύνορα με γειτονικές χώρες;', options: ['Ρωσία', 'Βραζιλία', 'Κίνα', 'Γερμανία'], correctIndex: 2 },
  { id: 'geo_3_02', category: 'Γεωγραφία', difficulty: 3, text: 'Ποιο είναι το βαθύτερο σημείο του ωκεανού;', options: ['Τάφρος Μαριανών', 'Τάφρος Τόνγκα', 'Τάφρος Φιλιππίνων', 'Τάφρος Πουέρτο Ρίκο'], correctIndex: 0 },
  { id: 'geo_3_03', category: 'Γεωγραφία', difficulty: 3, text: 'Ποια είναι η πρωτεύουσα του Καζακστάν;', options: ['Αλμάτι', 'Αστανά/Νουρ-Σουλτάν', 'Σιμκέντ', 'Καραγκάντα'], correctIndex: 1 },
  { id: 'geo_3_04', category: 'Γεωγραφία', difficulty: 3, text: 'Ποιο νησί ανήκει στην Ελλάδα και βρίσκεται πιο ανατολικά;', options: ['Σάμος', 'Ρόδος', 'Καστελλόριζο', 'Χίος'], correctIndex: 2 },
  { id: 'geo_3_05', category: 'Γεωγραφία', difficulty: 3, text: 'Ποια χώρα δεν εξόδου στη θάλασσα έχει το μεγαλύτερο εμπόριο;', options: ['Ουγγαρία', 'Αυστρία', 'Ελβετία', 'Βολιβία'], correctIndex: 2 },

  // ── Τέχνες ──
  { id: 'arts_1_01', category: 'Τέχνες', difficulty: 1, text: 'Ποιος ζωγράφισε την «Ελλάς Ευγνωμονούσα»;', options: ['Θεόδωρος Βρυζάκης', 'Νικηφόρος Λύτρας', 'Δημήτριος Σκουρτέλης', 'Νίκος Χατζηκυριάκος-Γκίκας'], correctIndex: 0 },
  { id: 'arts_1_02', category: 'Τέχνες', difficulty: 1, text: 'Ποιος έγραψε την «Οδύσσεια»;', options: ['Ησίοδος', 'Αισχύλος', 'Όμηρος', 'Σοφοκλής'], correctIndex: 2 },
  { id: 'arts_1_03', category: 'Τέχνες', difficulty: 1, text: 'Ποιος Έλληνας συνθέτης έγραψε τη μουσική για το «Ζορμπάς ο Έλληνας»;', options: ['Βαγγέλης Παπαθανασίου', 'Μίκης Θεοδωράκης', 'Μάνος Χατζηδάκης', 'Σταύρος Ξαρχάκος'], correctIndex: 1 },
  { id: 'arts_1_04', category: 'Τέχνες', difficulty: 1, text: 'Πόσες μούσες υπήρχαν στην ελληνική μυθολογία;', options: ['7', '8', '9', '12'], correctIndex: 2 },
  { id: 'arts_1_05', category: 'Τέχνες', difficulty: 1, text: 'Ποιος ήταν ο θεός της μουσικής στην αρχαία Ελλάδα;', options: ['Ζευς', 'Ερμής', 'Απόλλωνας', 'Διόνυσος'], correctIndex: 2 },
  { id: 'arts_2_01', category: 'Τέχνες', difficulty: 2, text: 'Ποιος συνέθεσε τον «Ύμνο εις την Ελευθερίαν»;', options: ['Νικόλαος Μάντζαρος', 'Σπυρίδων Σαμάρας', 'Νίκος Σκαλκώτας', 'Μίκης Θεοδωράκης'], correctIndex: 0 },
  { id: 'arts_2_02', category: 'Τέχνες', difficulty: 2, text: 'Ποιος Έλληνας ποιητής τιμήθηκε με Νόμπελ Λογοτεχνίας το 1963;', options: ['Ανδρέας Εμπειρίκος', 'Γιώργος Σεφέρης', 'Οδυσσέας Ελύτης', 'Νίκος Καζαντζάκης'], correctIndex: 1 },
  { id: 'arts_2_03', category: 'Τέχνες', difficulty: 2, text: 'Ποιο έργο του Σοφοκλή αναφέρεται στον Οιδίποδα;', options: ['Αντιγόνη', 'Ηλέκτρα', 'Αίας', 'Οιδίπους Τύραννος'], correctIndex: 3 },
  { id: 'arts_2_04', category: 'Τέχνες', difficulty: 2, text: 'Ποιος Έλληνας ηθοποιός έχει κερδίσει Όσκαρ;', options: ['Μελίνα Μερκούρη', 'Κατερίνα Διδασκάλου', 'Ειρήνη Παππά', 'Καρόλα Σκλαβενίτη'], correctIndex: 0 },
  { id: 'arts_2_05', category: 'Τέχνες', difficulty: 2, text: 'Ποια τέχνη ήταν ο Γιάννης Τσαρούχης;', options: ['Γλύπτης', 'Ζωγράφος', 'Ποιητής', 'Συνθέτης'], correctIndex: 1 },
  { id: 'arts_3_01', category: 'Τέχνες', difficulty: 3, text: 'Ποιος Έλληνας ποιητής έγραψε το «Άξιον Εστί»;', options: ['Γιώργος Σεφέρης', 'Κωνσταντίνος Καβάφης', 'Οδυσσέας Ελύτης', 'Ανδρέας Κάλβος'], correctIndex: 2 },
  { id: 'arts_3_02', category: 'Τέχνες', difficulty: 3, text: 'Ποιος συνέθεσε την όπερα «Μαρία Πενταγιώτισσα»;', options: ['Σπυρίδων Σαμάρας', 'Παύλος Καρρέρ', 'Νικόλαος Μάντζαρος', 'Διονύσιος Ρώδης'], correctIndex: 1 },
  { id: 'arts_3_03', category: 'Τέχνες', difficulty: 3, text: 'Σε ποιο έτος πέθανε ο Κωνσταντίνος Καβάφης;', options: ['1928', '1933', '1941', '1935'], correctIndex: 1 },
  { id: 'arts_3_04', category: 'Τέχνες', difficulty: 3, text: 'Ποιος Έλληνας αρχιτέκτονας σχεδίασε το Νέο Μουσείο της Ακρόπολης;', options: ['Δημήτριος Πικιώνης', 'Αρης Κωνσταντινίδης', 'Μπέρνχαρντ Τσούμι', 'Βασίλης Σγούτας'], correctIndex: 2 },
  { id: 'arts_3_05', category: 'Τέχνες', difficulty: 3, text: 'Ποιος Έλληνας κινηματογραφιστής σκηνοθέτησε το «Ταξίδι στα Κύθηρα»;', options: ['Κώστας Γαβράς', 'Θόδωρος Αγγελόπουλος', 'Νίκος Κούνδουρος', 'Παντελής Βούλγαρης'], correctIndex: 1 },
];

export function getQuestionById(id: string): Question | undefined {
  return questions.find((q) => q.id === id);
}

export function getQuestions(category: Category, difficulty: Points): Question[] {
  return questions.filter((q) => q.category === category && q.difficulty === difficulty);
}

export function pickQuestion(
  category: Category,
  difficulty: Points,
  usedIds: string[]
): Question | null {
  const pool = getQuestions(category, difficulty).filter((q) => !usedIds.includes(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const CATEGORIES: Category[] = [
  'Ιστορία',
  'Γεωγραφία',
  'Επιστήμη',
  'Αθλητισμός',
  'Τέχνες',
  'Ψυχαγωγία',
];
