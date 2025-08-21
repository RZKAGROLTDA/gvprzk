import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, MapPin, User, Building, CheckSquare, Camera, FileText, Plus, X, Download, RotateCcw, Phone, Wrench, Search, Check, CheckCircle, XCircle } from 'lucide-react';
import { Task, ProductType, Reminder } from '@/types/task';
import { cn } from '@/lib/utils';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CheckInLocation } from '@/components/CheckInLocation';
import { useOffline } from '@/hooks/useOffline';
import { useTasks } from '@/hooks/useTasks';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { toast } from '@/components/ui/use-toast';
import { ReportExporter } from '@/components/ReportExporter';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
interface CreateTaskProps {
  taskType?: 'field-visit' | 'call' | 'workshop-checklist';
}

const CreateTask: React.FC<CreateTaskProps> = ({ taskType: propTaskType }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlTaskType = searchParams.get('type');
  
  // Estado para autocomplete de códigos de cliente - mover para o topo
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredClientCodes, setFilteredClientCodes] = useState<{code: string, name: string}[]>([]);
  
  // Códigos de cliente reais
  const clientCodes = [
    { code: "50001", name: "PEDRO IRANI TONELLI" },
    { code: "50002", name: "CLAUDIR SIGNORINI" },
    { code: "50004", name: "SIDNEY LUIZ DE MATIAS HASS" },
    { code: "50005", name: "VENIR JOSE JUNGES" },
    { code: "50008", name: "MIRTON ANTONIO JUNGES" },
    { code: "50009", name: "ARNALDO DICK" },
    { code: "50013", name: "ARI GUNTZEL" },
    { code: "50014", name: "EUGENE DOUGLAS FERRELL" },
    { code: "50016", name: "NILO JOSE HEINEN" },
    { code: "50017", name: "WARNO JOAO WENTZ" },
    { code: "50019", name: "LUIZ CLOVIS NECKEL" },
    { code: "50020", name: "EDMAR KRONBAUER" },
    { code: "50028", name: "MOACIR BECKER GALERA" },
    { code: "50030", name: "DARCI HEEMANN" },
    { code: "50031", name: "CLAUDINO SIGNORINI E OUTRO" },
    { code: "50033", name: "RAUL SIGNORINI" },
    { code: "50034", name: "INACIO SCHIEHL E OUTRA" },
    { code: "50035", name: "ARLINDO CANCIAN" },
    { code: "50039", name: "EGON ALOISIO JUNG" },
    { code: "50045", name: "JOSE AUGUSTO TROVO" },
    { code: "50054", name: "FLAVIO ADALBERTO TIEMANN" },
    { code: "50055", name: "ELIO CARLOS DE OLIVEIRA" },
    { code: "50056", name: "ITAMAR DAGNESE" },
    { code: "50057", name: "CARLOS SIGNORINI" },
    { code: "50059", name: "VALDELIRIO LANZARIN" },
    { code: "50060", name: "THOMAS KALMBACH" },
    { code: "50061", name: "SABINO SIGNORINI" },
    { code: "50071", name: "EDMAR WITTER" },
    { code: "50072", name: "ARGEMIRO RODRIGUES DE SOUZA" },
    { code: "50076", name: "ALTAIR ZATTI" },
    { code: "50078", name: "BERTILO JOHANN" },
    { code: "50079", name: "CARLOS CANEPPELE" },
    { code: "50081", name: "EUCLASIO GARRUTTI JUNIOR" },
    { code: "50088", name: "HELIO AUGUSTO DO AMARAL" },
    { code: "50089", name: "CLAUDIO ALBERTO TOMM" },
    { code: "50092", name: "AGROPECUARIA RONCADOR LTDA" },
    { code: "50094", name: "NELDO EGON WEIRICH" },
    { code: "50108", name: "ARMIN KLIEWER" },
    { code: "50114", name: "ARTEMIO SCHIEHL E OUTRA" },
    { code: "50122", name: "ILDO JOSE KRUPP" },
    { code: "50126", name: "ADRIANO ALBERTO BOJARSKI" },
    { code: "50133", name: "JOSE LOURENCO FONTOURA FERRAZ" },
    { code: "50144", name: "SADI SECCO E OUTRO" },
    { code: "50148", name: "FRANCISCO ASSIS KAPPANN" },
    { code: "50153", name: "LUIS CARLOS ZENARO" },
    { code: "50154", name: "JANDIR BECKER GALERA" },
    { code: "50160", name: "RAFAEL GRANDO E OUTRO" },
    { code: "50161", name: "TIAGO GRANDO" },
    { code: "50175", name: "GELSON CANEPPELE" },
    { code: "50176", name: "EDSON PEREIRA DA COSTA" },
    { code: "50179", name: "PLINIO ROQUE PRESSI" },
    { code: "50181", name: "DENERACI PERIN" },
    { code: "50183", name: "TARCISIO CORNELIUS MULLER" },
    { code: "50184", name: "PAULO RODRIGUES DA CUNHA" },
    { code: "50185", name: "JOCEMAR ROBERTO SANGALETTI" },
    { code: "50189", name: "SAMOIL IVANOFF" },
    { code: "50190", name: "LORENO BUSNELLO" },
    { code: "50195", name: "ARMINDO JOSE ZEMOLIN" },
    { code: "50196", name: "ALCIDES LEO ZEMOLIN" },
    { code: "50199", name: "IGUACU MAQUINAS AGRICOLAS LTDA" },
    { code: "50200", name: "AUGUSTO SIGNORINI" },
    { code: "50202", name: "JAIR FERNANDO SCHAFER" },
    { code: "50207", name: "NILVO ERICH KUHN" },
    { code: "50216", name: "LEONIR BUSNELLO" },
    { code: "50217", name: "MARVALDI GORGEN E OUTRO" },
    { code: "50222", name: "BENILDO CARVALHO TELES" },
    { code: "50232", name: "CLAUDIO AUGUSTO DINIZ" },
    { code: "50260", name: "JOSHUA EDWARD NEUSCH" },
    { code: "50262", name: "AARON JOSEPH STUTZMAN" },
    { code: "50277", name: "JETSON GIACOMOLLI" },
    { code: "50282", name: "SERGIO DANIELLI" },
    { code: "50285", name: "ARIOVALDO J CASTANHARO E OUTRO" },
    { code: "50286", name: "LUIZ CARLOS NUNES CASTELO" },
    { code: "50296", name: "CELMO IORA" },
    { code: "50300", name: "IVO LUIZ RUARO" },
    { code: "50303", name: "ANDREANI CIOTA" },
    { code: "50304", name: "RODOLFO PAULO SCHLATTER" },
    { code: "50307", name: "JOSE MARCOLINI JUNIOR" },
    { code: "50312", name: "MARIO JOSE POSSAMAI" },
    { code: "50317", name: "CELSO CARLOS ROQUETTO" },
    { code: "50318", name: "JOAO DARCI SEIBT" },
    { code: "50326", name: "SERGIO CANEPPELE" },
    { code: "50327", name: "ALUISIO DE AGUIAR" },
    { code: "50328", name: "PAULO SERGIO  AGUIAR" },
    { code: "50338", name: "PAULO FELDKIRCHER" },
    { code: "50343", name: "AGRO BAGGIO MAQUINAS AGRICOLAS LTDA" },
    { code: "50354", name: "ANTONIO CESAR MARTINS DE BARROS" },
    { code: "50355", name: "ROMEU RAIMUNDO VOLKWEIS" },
    { code: "50364", name: "JOSENEI ZEMOLIN" },
    { code: "50371", name: "AVELINO SIMIONI" },
    { code: "50372", name: "IGUACU MAQUINAS AGRICOLAS LTDA" },
    { code: "50377", name: "CIRINEU DE AGUIAR" },
    { code: "50382", name: "JAIRO MACHADO CARNEIRO" },
    { code: "50410", name: "WSC AGROPECUARIA S/A" },
    { code: "50438", name: "OSMAR INACIO FRIZZO" },
    { code: "50444", name: "ROGERIO MAZZUTTI" },
    { code: "50446", name: "JACINTO COLOMBO" },
    { code: "50448", name: "JOSE ROBERTO MARQUES" },
    { code: "50455", name: "GERALDO ANTONIO DELAI" },
    { code: "50458", name: "MARSIMONE MARIA DE SOUZA OTTOBELI" },
    { code: "50461", name: "VALMOR GIACOMOLLI" },
    { code: "50466", name: "JULIO CESAR BURANELO E OUTRA" },
    { code: "50472", name: "MARCIA COSTA" },
    { code: "50491", name: "MILTON TSUYOSHI OKAJIMA" },
    { code: "50495", name: "SERGIO PASQUALOTTI" },
    { code: "50496", name: "DANIEL KOHLER" },
    { code: "50501", name: "IRIO JOSE GUISOLPHI" },
    { code: "50525", name: "ADALBERTO BACKES" },
    { code: "50529", name: "MAURO FERNANDO SCHAEDLER" },
    { code: "50537", name: "GILMAR DOMINGOS PASCOAL" },
    { code: "50538", name: "OSNI JAIR HOFFMANN" },
    { code: "50552", name: "LEANDRO ANTONIO BOJARSKI" },
    { code: "50561", name: "VITAL PASSINATO" },
    { code: "50565", name: "CAIO NOGUEIRA BATTISTETTI" },
    { code: "50569", name: "MARCOS AUGUSTO BORSATO" },
    { code: "50579", name: "IVAIR JOSE WERLANG" },
    { code: "50580", name: "RISTOF AUTO ELETRICA LTDA - EPP" },
    { code: "50594", name: "EDORLI EDSON HOFFMANN" },
    { code: "50595", name: "ALTAIR JUNGES" },
    { code: "50597", name: "ITA PNEUS AGRO LTDA" },
    { code: "50602", name: "JORGE ARSENIO JUNGES" },
    { code: "50603", name: "CAMILO GRESELE E OUTROS" },
    { code: "50610", name: "JOAO APIO" },
    { code: "50616", name: "LIRIO ANTONIO SCHUSTER" },
    { code: "50626", name: "ANDRE BONMANN" },
    { code: "50627", name: "ANDREO TOMBINI" },
    { code: "50633", name: "CARLOS ALOISIO HENKES" },
    { code: "50641", name: "CEZAR CASALI" },
    { code: "50651", name: "JOSE ABILIO JUNGES" },
    { code: "50661", name: "LEANDRO NICOLAU BENDER" },
    { code: "50662", name: "CHARLES ANDRE BENDER" },
    { code: "50692", name: "PAULO DALBERTO KREMER DA ROSA" },
    { code: "50695", name: "LUCIANO JACINTO DA SILVA" },
    { code: "50700", name: "JOSE APARECIDO POLATO" },
    { code: "50717", name: "DECIO ANTONIO TISOTT" },
    { code: "50721", name: "EDSON ANTONIO TREBESCHI" },
    { code: "50733", name: "FABIANO DALL ASTA" },
    { code: "50737", name: "AGRO BAGGIO MAQUINAS AGRICOLAS LTDA" },
    { code: "50744", name: "LEONEL ROQUE BOJARSKI" },
    { code: "50751", name: "MAURICIO CARDOSO TONHA" },
    { code: "50754", name: "MARCIA ROSANE SIEBEN DAGNESE" },
    { code: "50784", name: "LEONILDO PRONER" },
    { code: "50790", name: "AUREO EDUARDO CARVALHO FREITAS" },
    { code: "50812", name: "MAURI ANTONIO FERRAZ" },
    { code: "50816", name: "ASTER MAQUINAS SOLUCOES INTEGRADAS LTDA" },
    { code: "50824", name: "OLIMAR LUCIANO SCHNEIDER" },
    { code: "50827", name: "LUIZ OSMAR DALLA COSTA" },
    { code: "50837", name: "SERGIO AZEVEDO INTROVINI  E OUTROS" },
    { code: "50845", name: "WALTER SCHLATTER" },
    { code: "50853", name: "JULIANO PERIN PIZZOLATTO" },
    { code: "50854", name: "RICARDO ALVES DA COSTA" },
    { code: "50858", name: "WILSON DELMIR FUCKS" },
    { code: "50864", name: "ANA LUCIA CORDESCHI DONEGA" },
    { code: "50874", name: "MILTON WEBER" },
    { code: "50885", name: "MARCELO FRIES" },
    { code: "50887", name: "ANDERSON MATTE" },
    { code: "50889", name: "MILTON ROPKE" },
    { code: "50891", name: "LUCIANO PERIN HEINEN" },
    { code: "50892", name: "ANTONIO CARLOS DETONI" },
    { code: "50896", name: "LUCIANO SEBALD" },
    { code: "50906", name: "AMIR ELICEU ZEMOLIN" },
    { code: "50919", name: "ROMEU FROELICH" },
    { code: "50923", name: "OSCAR LUIZ CERVI" },
    { code: "50925", name: "ELVIM ROCHTESCHEL" },
    { code: "50928", name: "JOSSEMIR PASQUALOTTI" },
    { code: "50929", name: "EGMAR JOAQUIM RICHTER JUNIOR" },
    { code: "50935", name: "SERGIO APARECIDO POLATO" },
    { code: "50938", name: "VIANA RESENDE E CIA LTDA  ME" },
    { code: "50939", name: "ELDER FELIPE AMARAL SCHIRMBECK" },
    { code: "50943", name: "JACOB DOMINGOS MOURO E OUTROS" },
    { code: "50961", name: "VALERIA SIQUEIRA GONCALVES E OUTROS" },
    { code: "50966", name: "RAFAEL GRECZYSZN" },
    { code: "50970", name: "BENHUR FRANKLIN SCHAFER" },
    { code: "50978", name: "VALDAIR HAUENSTEIN GRANJA" },
    { code: "50992", name: "HANS GEORG KALMBACH" },
    { code: "50993", name: "PAULO CANDIOTTO" },
    { code: "50998", name: "LEONEL GARCIA VALARETO" },
    { code: "51001", name: "ABEL TERRUGGI LEOPOLDINO E OUTROS" },
    { code: "51012", name: "DOMINGOS SAVIO XAVIER" },
    { code: "51035", name: "ANTONIO CARLOS MOSCONI" },
    { code: "51039", name: "PERCIO LUIZ CANCIAN" },
    { code: "51047", name: "LEONARDO NEPONUCENO MICHARKI" },
    { code: "51048", name: "AIRTON RUBERT" },
    { code: "51050", name: "NELSON DICK" },
    { code: "51057", name: "GELSON BURNIER" },
    { code: "51070", name: "DELLFER BOMBAS INJETORAS LTDA" },
    { code: "51074", name: "LEONI PEDRO SARI" },
    { code: "51078", name: "DIULISSES PULCHERIO DIAS" },
    { code: "51087", name: "ALCIDES AUGUSTO DA COSTA AGUIAR" },
    { code: "51097", name: "JULIANO COSTA GARRUTI" },
    { code: "51102", name: "EDVINO JERKE" },
    { code: "51110", name: "SEVERINO MIGUEL LOSS" },
    { code: "51111", name: "LUIZ CLAUDINO LOSS" },
    { code: "51112", name: "HUMBERTO ARNALDO SANTOS" },
    { code: "51115", name: "BRUNO MARQUES GUIDI" },
    { code: "51120", name: "GILMAR DELL OSBEL E OUTRO" },
    { code: "51122", name: "MARCIO KOHLER" },
    { code: "51128", name: "ADIR ARENHART" },
    { code: "51136", name: "ORILDE CECILIA SANGALETTI" },
    { code: "51144", name: "LUIZ CARLOS HUESCAR" },
    { code: "51147", name: "THIAGO BEE BRESSAN" },
    { code: "51160", name: "HUMBERTO ARNALDO SANTOS FILHO E OUTROS" },
    { code: "51181", name: "AGROPECUARIA MAGGI L" },
    { code: "51182", name: "PAULO VIEIRA GONCALVES" },
    { code: "51186", name: "EVERSON ROGERIO PIMENTEL BALBINO" },
    { code: "51187", name: "HABIO PEREIRA MARCIANO E OUTRA" },
    { code: "51196", name: "RODRIGO SIPPERT" },
    { code: "51198", name: "WALISVAN VIEIRA GONCALVES" },
    { code: "51204", name: "TAQUARI AGRO COMERCIAL LTDA" },
    { code: "51209", name: "MILTON VILELA DE CARVALHO" },
    { code: "51215", name: "RUDOLF THOMAS MARIA  AERNOUDTS" },
    { code: "51231", name: "FELIPE ADROALDO RAMPELOTTO GATTO" },
    { code: "51244", name: "ANA CLAUDIA BORGES DE ALMEIDA COELH" },
    { code: "51247", name: "MARIO DEFENTE NETO E OUTROS" },
    { code: "51249", name: "JOSEMIR TADEU SIMON" },
    { code: "51253", name: "OSMAR BRUNETTA E OUTRA" },
    { code: "51259", name: "ALEXSANDRO PEIXOTO LEOPOLDINO E OUTRA" },
    { code: "51263", name: "LEANDRO PINTO DA SILVA" },
    { code: "51264", name: "CLAUDENOR ZOPONE JUNIOR" },
    { code: "51267", name: "MARCIO AGNESINI DO AMARAL" },
    { code: "51277", name: "ANACLETO BRUNETTA E OUTROS" },
    { code: "51281", name: "JOAO CARLOS CALGARO E OUTROS" },
    { code: "51290", name: "ALCIDES LUIZ MENIN" },
    { code: "51302", name: "NILSON ERWINO LOTTERMANN E OUTRO" },
    { code: "51303", name: "NELSON ALCIDES LOTTERMANN" },
    { code: "51307", name: "JOSE LUIZ POLIZELLI" },
    { code: "51316", name: "EUCLIDES FACCHINI FILHO E OUTROS" },
    { code: "51326", name: "JONES LUIZ HEEMANN" },
    { code: "51346", name: "MARCIO CAETANO DA ROSA" },
    { code: "51353", name: "VALTER PAULETTO" },
    { code: "51357", name: "PABREU AGROPECUARIA LTDA" },
    { code: "51359", name: "NILSON FRANCISCO ALESSIO" },
    { code: "51364", name: "MARCIO LONGOBARDI BETT" },
    { code: "51366", name: "WANDER LUIZ MARQUES" },
    { code: "51370", name: "ENDRIGO DALCIN" },
    { code: "51373", name: "OTMAR LAURO DERLAN" },
    { code: "51374", name: "ILDO TIRLONI" },
    { code: "51377", name: "ALIPIO DIVINO BORGES PORTILHO" },
    { code: "51386", name: "VALDIR LUIZ FRAPPORTI" },
    { code: "51391", name: "JOSE REIS VILELA" },
    { code: "51393", name: "DYEFREI FERNANDO SANTIN" },
    { code: "51409", name: "RONALDO PERES CARVALHO" },
    { code: "51417", name: "LUCAS MEDEIROS TELES" },
    { code: "51420", name: "SEBASTIAO SIQUEIRA TROVO" },
    { code: "51430", name: "QUEZIO BATISTA DA SILVA" },
    { code: "51436", name: "AGRO BAGGIO MAQUINAS AGRICOLAS LTDA" },
    { code: "51452", name: "JOAO BATISTA SA" },
    { code: "51460", name: "AIRTON LUIZ PILZ" },
    { code: "51466", name: "ORFISIO FERREIRA BORGES" },
    { code: "51475", name: "JOAQUIM MARQUES DA SILVA" },
    { code: "51479", name: "MARQUES ANTONIO DA SILVA" },
    { code: "51485", name: "LUCIMAR DOS REIS PASCOAL" },
    { code: "51490", name: "ALFREDO ANTILLON CARVALHO FERREIRA" },
    { code: "51497", name: "PEDRO NAZARI" },
    { code: "51502", name: "VINICIUS TEODORO MICHELS" },
    { code: "51504", name: "JOAO CARLOS ZERIAL PARIS" },
    { code: "51515", name: "LUIZ FLAVIO ROCHA SACCARDO" },
    { code: "51524", name: "ASTER MAQUINAS E SOLUCOES INT. LTDA" },
    { code: "51531", name: "VALMOR ANTONIO BERNIERI E CIA LTDA" },
    { code: "51539", name: "LUIS GUSTAVO PROENCA CAPPELLARO" },
    { code: "51543", name: "JOSE APIO" },
    { code: "51544", name: "TELVI ANTONIO MARCHIORETTO E OUTROS" },
    { code: "51549", name: "DILERMANDO ANGELO PEZERICO" },
    { code: "51554", name: "CLERES FURTADO" },
    { code: "51558", name: "CELSO DEDA" },
    { code: "51559", name: "EVALDO EMILIO DE ARAUJO" },
    { code: "51566", name: "FELIPE IVANOFF" },
    { code: "51569", name: "ADILSON CLETO BIER" },
    { code: "51570", name: "GERSON FRANCISCO" },
    { code: "51572", name: "MAURICIO BERNARDI" },
    { code: "51577", name: "GUSTAVO LAURO KORTE JUNIOR" },
    { code: "51582", name: "ANTONIO GIACOBBO" },
    { code: "51586", name: "EDER HEPFNER" },
    { code: "51590", name: "ARI MARIN" },
    { code: "51602", name: "ELTON REICHERT TEN CATEN" },
    { code: "51622", name: "EDGAR VALENTIM RAGAGNIN" },
    { code: "51629", name: "SERGIO DE MARCO E OUTRO" },
    { code: "51650", name: "CESAR TORRES VEDANA" },
    { code: "51664", name: "CARLOS ALBERTO POLATO" },
    { code: "51674", name: "PEDRO DA LUZ DINIZ" },
    { code: "51676", name: "ROBERTO PONTES BORGES" },
    { code: "51683", name: "VANDERLEI BRUNETTA E OUTRA" },
    { code: "51685", name: "WELLISCLEY CLEMENTE DA COSTA" },
    { code: "51699", name: "MARCIA FERNANDA FERREIRA" },
    { code: "51703", name: "ANA ELISA SEHN ZART" },
    { code: "51715", name: "OZORIO DA LUZ DINIZ" },
    { code: "51726", name: "MARISA LIZOLETE RIETJENS E OUTROS" },
    { code: "51731", name: "LINO COSTA E OUTRA" },
    { code: "51739", name: "VELTON VALDEMAR GUNTZEL" },
    { code: "51740", name: "OTAVIO SCHUHL E OUTRA" },
    { code: "51744", name: "DIEGO FERNANDO PASQUALOTTI" },
    { code: "51749", name: "ASTER MAQUINAS E SOLUCOES INTEGRADAS LTD" },
    { code: "51751", name: "HERMELINO PEREIRA BONFIM" },
    { code: "51753", name: "RODRIGO LELLIS BALARDIN" },
    { code: "51754", name: "NEURI NORBERTO WINK" },
    { code: "51758", name: "JOSE LUIZ DE LAURENTIZ SOBRINHO" },
    { code: "51759", name: "JOSEVALDO SOUZA DOS SANTOS" },
    { code: "51770", name: "EUDER IGNACIO" },
    { code: "51771", name: "SIDINEI ROBERTO CORBARI" },
    { code: "51775", name: "ADELINO ROBL" },
    { code: "51778", name: "GABRIEL MARTINS CASSOL" },
    { code: "51798", name: "VOLMAR JOSE MAGGIONI" },
    { code: "51805", name: "ROBECA PARTICIPACOES LTDA" },
    { code: "51820", name: "NELSON RENI SCHULZ E OUTROS" },
    { code: "51831", name: "BUNGE ALIMENTOS S/A" },
    { code: "51846", name: "CHOU HSIU I E OUTROS" },
    { code: "51853", name: "JOAO PAULO KOVALHUK" },
    { code: "51859", name: "JULIANO CUNHA DE ASSUNCAO PINTO" },
    { code: "51861", name: "THOMAS MATIAS MICHELS" },
    { code: "51863", name: "VOLMIR ANTONIO MAGGIONI" },
    { code: "51864", name: "ROGERIO AURI MILANESI" },
    { code: "51872", name: "GILMAR WITTER" },
    { code: "51882", name: "AGROPECUARIA AGUA VIVA LTDA" },
    { code: "51888", name: "ROQUE ANTONIO BORTOLUZZI E OUTRA" },
    { code: "51893", name: "FABIO COSTA BIANCALANA" },
    { code: "51898", name: "IRINEU MARQUES DE ANDRADE JUNIOR" },
    { code: "51900", name: "ADELIR PASQUAL" },
    { code: "51902", name: "ILSEU CHRISTIANETTI" },
    { code: "51920", name: "GERALDO LOEFF" },
    { code: "51939", name: "HUGO HENRIQUE PEREIRA SANTOS" },
    { code: "51951", name: "CLECI VALENTINI CORTINA" },
    { code: "51963", name: "ANDERSON LUIZ MARTINS E OUTRO" },
    { code: "51989", name: "RUDINEI BARATTO" },
    { code: "51993", name: "EDUARDO ZAGO MACHADO" },
    { code: "51994", name: "JOSE SILVA DOMBROSKI" },
    { code: "51995", name: "ALIRIO JOAO WILBERT" },
    { code: "52003", name: "VERA CRUZ PARTICIPACOES LTDA" },
    { code: "52008", name: "PEDRO LOURENCO MONTES" },
    { code: "52009", name: "DOUGLAS MICHELS" },
    { code: "52025", name: "RODRIGO MATOS CARVALHO" },
    { code: "52036", name: "DARCE RAMALHO DOS SANTOS" },
    { code: "52042", name: "FAZENDA PIONEIRA EMPR AGRICOLA SA" },
    { code: "52048", name: "DIRCEU JOSE RAGAGNIN" },
    { code: "52077", name: "LEANDRO FILIPPI" },
    { code: "52080", name: "MABIO LUIZ DE MOURA" },
    { code: "52084", name: "LAUDIR PERETTI" },
    { code: "52104", name: "BENO GUILHERME ZIECH" },
    { code: "52106", name: "META AGRICULTURA DE PRECISAO LTDA" },
    { code: "52121", name: "SAVIO GUIMARAES BARBOSA" },
    { code: "52144", name: "EVANDRO CARLOS DORIGON" },
    { code: "52149", name: "JOSE IZIDORO CORSO" },
    { code: "52159", name: "JAIR PAVESI FILHO E OUTROS" },
    { code: "52167", name: "AGRO BAGGIO MAQUINAS AGRICOLAS LTDA" },
    { code: "52170", name: "RAQUEL PEREIRA FONTANELLA" },
    { code: "52175", name: "MARINO BORTOLAS NETO" },
    { code: "52182", name: "FRANCISCO ADEMIR DOS SANTOS" },
    { code: "52196", name: "VINICIUS FREDOLINO BACKES" },
    { code: "52201", name: "BUNGE ALIMENTOS S A" },
    { code: "52206", name: "DOUGLAS LIMA FERRELL" },
    { code: "52241", name: "KANNA LOCACOES LTDA" },
    { code: "52245", name: "JONIS SANTO ASSMANN" },
    { code: "52301", name: "SANDRO LUIZ GRESPAN" },
    { code: "52316", name: "RODRIGO ANTONIO SCHONS E OUTRA" },
    { code: "52317", name: "P I MALDANER JUNIOR  ME" },
    { code: "52344", name: "GRAZZIANI RODRIGO MENEZES CARVALHO" },
    { code: "52359", name: "RAFAEL COUTO GUERRA" },
    { code: "52363", name: "VALDIVINO CALIXTO FILHO" },
    { code: "52364", name: "DARCI LAND" },
    { code: "52366", name: "BENJAMIN RAMPELOTTO JUNIOR" },
    { code: "52370", name: "GEORGE FELIPE O REZENDE RIBEIRO E OUTRO" },
    { code: "52387", name: "SILVANA GIOVANNA CORTI DI  R  DI  C  S" },
    { code: "52396", name: "NISSEY MAQUINAS AGRICOLAS LTDA" },
    { code: "52401", name: "JAZON DE SOUZA FREITAS FILHO" },
    { code: "52415", name: "ANDRE FRANCA RODRIGUES" },
    { code: "52417", name: "INOVA EQUIPAMENTOS LTDA" },
    { code: "52425", name: "JUCARA DE CASTRO FRANCA RODRIGUES" },
    { code: "52436", name: "MARCOS ANTONIO CASSOL" },
    { code: "52437", name: "ANDRE TOMBINI" },
    { code: "52462", name: "ITACIR JOSE PICININ" },
    { code: "52465", name: "STEVEN ERIKSEN BINNIE" },
    { code: "52467", name: "SULEIDIR FREITAS SILVA" },
    { code: "52476", name: "CESAR LUIS FRIEDRICHS E OUTRA" },
    { code: "52478", name: "META CONSULTORIA AGRICOLA LTDA" },
    { code: "52481", name: "MAURICIO PAULO MADALOSSO" },
    { code: "52485", name: "GILBERTO FRANCA RODRIGUES" },
    { code: "52491", name: "VICENTE PRESSI" },
    { code: "52498", name: "IVANDRO BARCHET" },
    { code: "52512", name: "MARCOS ANTONIO DIAS JACINTO" },
    { code: "52518", name: "JANIO FERRARI" },
    { code: "52520", name: "ALEXANDRE GUIDI" },
    { code: "52542", name: "MAURO MIGUEL FRANCIOSI E OUTROS" },
    { code: "52545", name: "PAULO EGIDIO DA SILVA ABREU" },
    { code: "52554", name: "JOSE MATIAS MICHELS" },
    { code: "52564", name: "PASTORIL AGROPECUARIA COUTO MAGALHAES LTDA" },
    { code: "52567", name: "MARCIA NUBIA MOREIRA DA SILVA E OUTROS" },
    { code: "52591", name: "PEHZA TECNOLOGIA  AGRICOLA LTDA" },
    { code: "52593", name: "LUIZ ANTONIO FREGADOLLI NABEIRO" },
    { code: "52594", name: "LEONARDO BORGES CARRIJO" },
    { code: "52602", name: "DARCI VICENTE RAGAGNIN" },
    { code: "52606", name: "SERGIO EDUARDO RIBEIRO" },
    { code: "52622", name: "MARCIOLINO DE SOUZA COSTA" },
    { code: "52629", name: "ARY JOSE FERRARI" },
    { code: "52772", name: "PEDRO GOMES RODRIGUES" },
    { code: "52774", name: "ARI DO PRADO" },
    { code: "52781", name: "FELIX ARI RUARO" },
    { code: "52787", name: "NADIR SUCOLOTTI" },
    { code: "52791", name: "RICARDO AFIF CURY FILHO E OUTRA" },
    { code: "52804", name: "SERGIO BARZOTTO" },
    { code: "52807", name: "WALTER BUSSADORI JUNIOR" },
    { code: "52812", name: "RAFAEL TOMAZ ABREU" },
    { code: "52821", name: "ELIVAGNER MENDES BATISTA" },
    { code: "52831", name: "JONATHAN TIAGO ROCHTESCHEL" },
    { code: "52845", name: "PEDRO FUECHTER" },
    { code: "52846", name: "JAIME ANDRE GUARESCHI" },
    { code: "52860", name: "GIOVANI MAZIERO" },
    { code: "52861", name: "MIGUEL JOSE BRUNETTA" },
    { code: "52862", name: "ELIMAR KOPP" },
    { code: "52877", name: "NELSON ANDRE BERGAMO" },
    { code: "52896", name: "EDIPO GONCALVES DE ALMEIDA" },
    { code: "52897", name: "SANTO MARTINS PINTO NETO" },
    { code: "52903", name: "RICARDO ALEXANDRE BORGES" },
    { code: "52904", name: "MARCOS HUMBERTO TIAGO NOGUEIRA" },
    { code: "52915", name: "NELSON COLDEBELLA" },
    { code: "52919", name: "SIEGFRIED KUBELKE" },
    { code: "52925", name: "ELDER MORO PICIN" },
    { code: "52935", name: "AGROPECUARIA ANGICO EIRELI EPP" },
    { code: "52940", name: "GILBERTO RISSARDI JUNIOR E OUTROS" },
    { code: "52954", name: "CANISIO FROELICH" },
    { code: "52963", name: "HERMOGENES FERREIRA DA FONSECA" },
    { code: "52965", name: "SILMAR ANTONIO CRUVINEL" },
    { code: "52967", name: "JONATHAN BEN" },
    { code: "52972", name: "FABIO ANDERSON JUNG" },
    { code: "52976", name: "WALTERNEY MEES" },
    { code: "52980", name: "ASTOR RUBEM ULLMANN" },
    { code: "52982", name: "EBER BIOENERGIA E AGRICULTURA LTDA" },
    { code: "52983", name: "LEIDE BENTO CARRIJO SOUSA" },
    { code: "52992", name: "ARMANDO MARTINS DE OLIVEIRA" },
    { code: "52994", name: "AGROPECUARIA AGUA PRETA SA" },
    { code: "52996", name: "DEISE PIOVEZANA GUSTHMANN E OUTROS" },
    { code: "53038", name: "ASTER MAQUINAS E SOLUCOES INTEGRADAS LTD" },
    { code: "53046", name: "JOSE ANTONIO SCUSSEL" },
    { code: "53052", name: "PAULO ROBERTO BETI" },
    { code: "53065", name: "AGNALDO FERNANDES" },
    { code: "53066", name: "GILBERTO DE PAULA E SILVA" },
    { code: "53071", name: "MARCOS LUIS FRONZA" },
    { code: "53072", name: "DARLEI PEDRO GOLDONI" },
    { code: "53077", name: "CINTIA YOSHIMINE SANTINI" },
    { code: "53088", name: "ENIO CHARLES SILVA VILELA" },
    { code: "53093", name: "VALDENIR ANTONIO MULARI" },
    { code: "53101", name: "ELOI ERVINO WILLIG" },
    { code: "53108", name: "RAFAEL BORTOLI E OUTRAS" },
    { code: "53112", name: "ANDRE JUNIOR DELL OSBEL" },
    { code: "53118", name: "VALTAIR ERNI ARENHART" },
    { code: "53121", name: "CACINELI PES MICHELS" },
    { code: "53124", name: "JOCELITO KRUG" },
    { code: "53125", name: "HAROLDO BARBOSA DA SILVA" },
    { code: "53127", name: "IGUACU MAQUINAS AGRICOLAS LTDA" },
    { code: "53136", name: "SYLVIA LEDA AMARAL PINHO DE ALMEIDA" },
    { code: "53141", name: "ADEMAR VANZELA" },
    { code: "53143", name: "DENER ARIEL FERRARI" },
    { code: "53152", name: "GIRASSOL AGRICOLA LTDA" },
    { code: "53170", name: "SERGIO SERONNI" },
    { code: "53177", name: "LETHIERI AIMI" },
    { code: "53183", name: "BOM FUTURO AGRICOLA LTDA" },
    { code: "53188", name: "JORGE GABE" },
    { code: "53190", name: "CARLOS EDUARDO SVERZUT BARONI" },
    { code: "53203", name: "EDIO NAVARINI" },
    { code: "53214", name: "VOLMIR VANCIN" },
    { code: "53223", name: "ANDRE LUIS ZANINI SVERZUT E OUTROS" },
    { code: "53224", name: "VILMAR LUIZ GIACOMOLLI" },
    { code: "53254", name: "VALI FULBER CAUMO" },
    { code: "53265", name: "LUCIA BOESING" },
    { code: "53271", name: "LEONARDO ALVES TEIXEIRA RIBEIRO" },
    { code: "53277", name: "GABRIEL NEPONUCENO MICHARKI" },
    { code: "53308", name: "DEMAX LOG TRANSPORTES E LOCACAO DE MAQUI" },
    { code: "53347", name: "JOSE ZAFALON" },
    { code: "53360", name: "AUGUSTO DE OLIVEIRA CARVALHO" },
    { code: "53373", name: "MANOEL CARLOS ALVES DA CUNHA" },
    { code: "53375", name: "RODRIGO DA SILVA DOS REIS" },
    { code: "53383", name: "ALLAN CESAR POCAS" },
    { code: "53387", name: "EURICELDES MACEDO GOULART" },
    { code: "53409", name: "JUVENOR MANOEL FERREIRA" },
    { code: "53421", name: "SEBASTIAO GERALDO LOPES" },
    { code: "53423", name: "JUNIOR VENERANDO RODRIGUES  DE MORAIS" },
    { code: "53426", name: "HUMBERTO DAVID SANTANA" },
    { code: "53427", name: "AUGUSTO BALDIN" },
    { code: "53435", name: "DERMEVAL RODRIGUES DA CUNHA JUNIOR" },
    { code: "53463", name: "ISIDORO RIZZI BALDIN E OUTROS" },
    { code: "53471", name: "JOAO BASTOS DE LIMA E OUTROS" },
    { code: "53475", name: "VITOR APARECIDO GONCALVES" },
    { code: "53487", name: "VANDERLEI ADELAR LERNER" },
    { code: "53491", name: "MARCOS ANDRE BERTOL" },
    { code: "53495", name: "INDIOMAR FRANCISCO DA SILVA" },
    { code: "53498", name: "ERTON SIGNORINI" },
    { code: "53508", name: "DIRCO FRANCISCO OLIVEIRA" },
    { code: "53516", name: "ALEX ELIEL WUTZKE" },
    { code: "53517", name: "CARLOS AUGUSTO MORAES PORFIRIO" },
    { code: "53518", name: "IVANIR ALVES DA SILVA" },
    { code: "53519", name: "ANISIO VILELA CRUVINEL" },
    { code: "53520", name: "ANA MARIA BRIZOT BENTO" },
    { code: "53521", name: "MAURO DONIZETTI SILVERIO RODRIGUES" },
    { code: "53532", name: "JACIR VIDARENKO" },
    { code: "53539", name: "JANIO CARLOS MOREIRA DA SILVA" },
    { code: "53561", name: "ANTONIO LUIZ SACCO" },
    { code: "53575", name: "MARCELO FERNANDO VANKEVICIUS" },
    { code: "53579", name: "CANARANA COM. DE MAQ. PECAS E IMPL. AGRI" },
    { code: "53586", name: "VALDIR DE CARVALHO" },
    { code: "53592", name: "LUCA LIMA OLIVEIRA" },
    { code: "53605", name: "ANDREAS RAUL WUTZKE" },
    { code: "53611", name: "ANTONIO CARLOS BOLDRIN" },
    { code: "53637", name: "JOSE ROBERTO ALVES BARBOSA" },
    { code: "53640", name: "ALEXANDRE DALLA COSTA" },
    { code: "53644", name: "IVANDRO ULMERINDO VARGAS" },
    { code: "53648", name: "APARECIDA CAETANO VINHAL" },
    { code: "53650", name: "MAURO TREVISAN" },
    { code: "53662", name: "CLAUDIO RENATO MALDANER" },
    { code: "53679", name: "ISMAEL GORGEN" },
    { code: "53687", name: "LAGOA DA SERRA AGROPECUARIA LTDA" },
    { code: "53700", name: "VALERIA CRISTINA RODRIGUES FARIA" },
    { code: "53705", name: "DAYAN DELLA JUSTINA VIEIRA" },
    { code: "53715", name: "AFB AGROPECUARIA, FAZ BRASIL LTDA" },
    { code: "53719", name: "FABRICIO GODESKI MOREIRA" },
    { code: "53732", name: "ERDIN JERKE" },
    { code: "53733", name: "EDIVAINE ALVES FERREIRA" },
    { code: "53735", name: "JULIO ANTONIO VASSOLER" },
    { code: "53747", name: "AFB AGROPECUARIA, FAZ BRASIL LTDA" },
    { code: "53748", name: "AFB AGROPECUARIA, FAZ BRASIL LTDA" },
    { code: "53753", name: "SERGIO ULMER" },
    { code: "53791", name: "AMAGGI EXPORTACAO E IMPORTACAO LTDA" },
    { code: "53810", name: "VALDECIR BRUTSCHER" },
    { code: "53823", name: "AREDIO CARNEIRO DE SOUZA" },
    { code: "53829", name: "HEDO KAMPFF" },
    { code: "53832", name: "MAURO ANTONIO PALUDO" },
    { code: "53843", name: "MARCOS ROBERTO VIAN" },
    { code: "53845", name: "ALBERTO LUIZ BORTOLUZZI" },
    { code: "53851", name: "EDENILSON SARNOWSKI" },
    { code: "53867", name: "MARCOS VENICIO DE OLIVEIRA" },
    { code: "53872", name: "COLPAR PARTICIPACOES S/A" },
    { code: "53875", name: "GTS DO BRASIL LTDA" },
    { code: "53889", name: "JACI LURDES COLFERAI" },
    { code: "53893", name: "ANTONIO ROMUALDO VIEIRA" },
    { code: "53899", name: "SAUL FERREIRA DE MOURA FILHO" },
    { code: "53902", name: "LEOMAR BECKER SPIER" },
    { code: "53918", name: "DERLI LORENZONI NICOLODI" },
    { code: "53940", name: "DEOCLIDES COLOMBO" },
    { code: "53955", name: "ADELIR PETER" },
    { code: "53964", name: "RAFAEL RICARDO COLFERAI" },
    { code: "53987", name: "K P DA SILAGEM LTDA" },
    { code: "53995", name: "FERNANDO CIRLEI MASSINI" },
    { code: "54000", name: "DARIEL JOSE FRAPPORTI" },
    { code: "54007", name: "BERNEGOSSI ASSESSORIA & ASSISTENCIA TECN" },
    { code: "54018", name: "CLOVIS ANTONIO CESCA" },
    { code: "54025", name: "SERGIO EDUARDO MARCON" },
    { code: "54032", name: "AGRINORTE LTDA" },
    { code: "54039", name: "RODOLFO DE SIQUEIRA REIS" },
    { code: "54050", name: "OZORIO DA LUZ DINIZ" },
    { code: "54060", name: "JOSE FERREIRA DA SILVA" },
    { code: "54061", name: "BOM FUTURO AGRICOLA LTDA" },
    { code: "54076", name: "DURLI AGROPECUARIA S/A" },
    { code: "54086", name: "GUILHERME RESENDE CRUVINEL" },
    { code: "54088", name: "GUILHERME KOK" },
    { code: "54095", name: "TARCIRIO ANTONIO GEBERT E OUTRO" },
    { code: "54098", name: "MAURO DE BARROS TAROZZO" },
    { code: "54099", name: "FRANCIELA DEYSE MEES" },
    { code: "54100", name: "ANDRE LUIZ ARAUJO MARTINELLI" },
    { code: "54108", name: "FRANCISCO DE PAULA  ASSIS RIBEIRO FILHO" },
    { code: "54126", name: "REALOESTE AGROPECUARIA" },
    { code: "54127", name: "VALDECI BARBOSA SOBRINHO" },
    { code: "54130", name: "RICARDO PANCOTTE" },
    { code: "54131", name: "DIEMES AGUSTINHO CATTO" },
    { code: "54140", name: "MARCO ANTONIO OLIVEIRA CAMPOS" },
    { code: "54152", name: "ASTER MAQUINAS E SOLUCOES INT. LTDA" },
    { code: "54158", name: "JADER ALVES PEREIRA" },
    { code: "54163", name: "CARLOS ALBERTO LOEFF" },
    { code: "54183", name: "MAURO VILMAR DAL PIAZ" },
    { code: "54188", name: "RICARDO TADACHI NOZAQUI" },
    { code: "54208", name: "MARLON DE FATIMA BORGES" },
    { code: "54209", name: "JURACI DIONISIO TRUCULO" },
    { code: "54220", name: "FERNANDO CESAR FACHOLLI" },
    { code: "54252", name: "DIEGO SICHOCKI" },
    { code: "54254", name: "EDIR CATTAPAN" },
    { code: "54287", name: "EURIDES ARENHART" },
    { code: "54289", name: "OLAM BRASIL LTDA" },
    { code: "54295", name: "JOSENILTON SILVA OLIVEIRA" },
    { code: "54296", name: "WALDEIR AUGUSTO GUIRAO ARVINA" },
    { code: "54300", name: "MARCOS HANUM MACHADO" },
    { code: "54302", name: "OMAR MACHADO DE SOUZA" },
    { code: "54328", name: "ANY KELLY POSTAL" },
    { code: "54349", name: "TAUA BIODIESEL LTDA" },
    { code: "54354", name: "AGROPECUARIA LOCKS LTDA" },
    { code: "54359", name: "LAERCIO PERES" },
    { code: "54367", name: "FERNANDA RAMPELOTTO BALBINO" },
    { code: "54372", name: "JOSE GOMES COITINHO" },
    { code: "54402", name: "JOAO CAETANO DE MELLO NETO" },
    { code: "54404", name: "JOCISLEY GONCALVES RICARDO" },
    { code: "54413", name: "SAN CARLO AGROPECUARIA LTDA ME" },
    { code: "54417", name: "DENIS CARLOS BRIANCINI E OUTRO" },
    { code: "54424", name: "ELOI MATIAS SEHN" },
    { code: "54425", name: "ROMUALDO DEARO DA SILVA" },
    { code: "54437", name: "JARDEL DE OLIVEIRA DE SOUZA" },
    { code: "54438", name: "ARMAC LOCACAO LOGISTICA E SERVICOS S A" },
    { code: "54445", name: "GUSTAVO ACIOLE SANTOS" },
    { code: "54447", name: "LEANDRO SOUZA FELICIANO" },
    { code: "54465", name: "MELLOS TRANSPORTES" },
    { code: "54473", name: "ELI TEREZINHA DA CUNHA SANTIN" },
    { code: "54480", name: "GILMAR CELESTINO DOS SANTOS" },
    { code: "54493", name: "ONALDO ANTONIO GOMES" },
    { code: "54494", name: "RAFAEL RENATO MALDANER" },
    { code: "54496", name: "ADAIR PIRES GUIMARAES" },
    { code: "54503", name: "FAZENDA IOWA LTDA" },
    { code: "54506", name: "ARTUR MORBACH DE DEUS" },
    { code: "54519", name: "RENATO THEODORO DE QUEIROZ" },
    { code: "54532", name: "RAFAEL MICHELAN BRAGA" },
    { code: "54536", name: "ALCIDES AUGUSTO DA FONSECA JUNIOR" },
    { code: "54539", name: "MARCIO RODOLFO MEDEIROS DE GODOI" },
    { code: "54542", name: "ILIANDRO SEGATTO" },
    { code: "54547", name: "WANDERSON IVANIR FERRI" },
    { code: "54555", name: "VALDEVINO JOSE ALVES" },
    { code: "54557", name: "ROTA OESTE MAQUINAS LTDA" },
    { code: "54563", name: "ADRIANO CABRAL JACINTO" },
    { code: "54565", name: "UESLEY WANDERLEI KUHN" },
    { code: "54571", name: "FLADEMIR ROMEU DEBASTIANI" },
    { code: "54608", name: "INES FEIJO" },
    { code: "54617", name: "SERGIO PAVEZZI E OUTROS" },
    { code: "54621", name: "GERALDO JOAO KONZEN" },
    { code: "54627", name: "WILTON EDUARDO MARTINS DE OLIVEIRA" },
    { code: "54632", name: "CLAUDEMIR TOLOTTI" },
    { code: "54656", name: "SALOMAO BARBOSA DE BRITO" },
    { code: "54657", name: "RODRIGO JOSE DE OLIVEIRA" },
    { code: "54659", name: "EVANDRO CARLOS PLENTZ" },
    { code: "54667", name: "VILMAR ROBERTI" },
    { code: "54668", name: "NILVANIA M. DE MORAES DELL OSBEL E OUTRO" },
    { code: "54684", name: "DIRCEU INEIA" },
    { code: "54686", name: "CLEIDIMARA SIDEGUM VIEIRA" },
    { code: "54687", name: "ANDRE DE MORAES ZUCATO" },
    { code: "54695", name: "GRACIELA MEES DE ANDRADE" },
    { code: "54696", name: "WILMAR MEES" },
    { code: "54702", name: "GEMIRO CARAFINI" },
    { code: "54712", name: "MADEIREIRA SAO PEDRO INDUSTRIA E COMERCIO DE MADEIRAS LTDA" },
    { code: "54720", name: "VANDERLEI LUIS BECKER" },
    { code: "54729", name: "ALDO FELIX DA SILVA" },
    { code: "54730", name: "IVAN KRUMMENAUER" },
    { code: "54737", name: "JOSE CLAUDIO DE SOUZA" },
    { code: "54755", name: "GILLIARD MICHELS VILELA" },
    { code: "54759", name: "BRUNO RICARDO SANTOS MARTINS" },
    { code: "54762", name: "JOAO PAULO GUIMARAES DIDONET" },
    { code: "54766", name: "JOANILDO OLIVEIRA" },
    { code: "54772", name: "BRUNO ALMEIDA SOUZA" },
    { code: "54783", name: "DIEGO SILVA DE ARRUDA" },
    { code: "54785", name: "TITO ELIAS BERNE E OUTRO" },
    { code: "54787", name: "FRANZ HALDER FERREIRA JACINTHO" },
    { code: "54800", name: "RODRIGO MARTINS DE FREITAS" },
    { code: "54819", name: "NAYARA STEFANIA KOLLN" },
    { code: "54827", name: "AMAURY MARTINS TAKAKI E OUTRO" },
    { code: "54829", name: "RICARDO KEMERICH" },
    { code: "54837", name: "RENE POMPEO DE PINA" },
    { code: "54842", name: "CIARAMA MAQUINAS LTDA" },
    { code: "54846", name: "FLAMBOYANT AGRO PASTORIL LTDA" },
    { code: "54847", name: "RENATO DE MELO MANTOVANI" },
    { code: "54848", name: "AGRICOLA FRANCISCO LTDA EPP" },
    { code: "54851", name: "GUSTAVO GUIMARAES VASCONCELOS E OUTROS" },
    { code: "54866", name: "RUBENS FACCHINI E OUTROS" },
    { code: "54870", name: "INJEDIESEL COM E SERV EM BOMBAS INJETORA" },
    { code: "54876", name: "RODRIGO FIEDLER EIRELI" },
    { code: "54878", name: "STA MONICA SERVICOS DE COLHEITAS LTDA" },
    { code: "54884", name: "VALDIVINO MARQUES DA SILVA" },
    { code: "54888", name: "DORIVAL RUIZ LINARES" },
    { code: "54891", name: "AGNALDO MARTINS CABRAL" },
    { code: "54926", name: "JONIS SANTO ASSMANN E OUTRO" },
    { code: "54938", name: "DURLI AGROPECUARIA LTDA" },
    { code: "54982", name: "VITOR AUGUSTO OLIVEIRA" },
    { code: "55003", name: "DILCEU BORGES" },
    { code: "55050", name: "MARCELO ROBERTO ANRAIN" },
    { code: "55071", name: "JOSE EDUARDO FREGADOLLI NABEIRO" },
    { code: "55075", name: "EUCLASIO GARRUTTI JUNIOR E OUTRA" },
    { code: "55097", name: "HALMIR ANTONIO SANTI" },
    { code: "55159", name: "EDUARDO REZENDE NOGUEIRA" },
    { code: "55210", name: "ANTONIO PERETTI" },
    { code: "55245", name: "BOM FUTURO AGRICOLA LTDA" },
    { code: "55251", name: "JOSE CARDOSO DE ALMEIDA E OUTROS" },
    { code: "55254", name: "LEONARDO BALDO E OUTRA" },
    { code: "55257", name: "CARLOS ANTONIO ROTTA" },
    { code: "55263", name: "CALISTO MULLER GOETZ" },
    { code: "55276", name: "VOLPI E CIA LTDA ME" },
    { code: "55292", name: "LUCAS ROMAGNOLI ROSSETO" },
    { code: "55354", name: "FERNANDO COSTA GARRUTI" },
    { code: "55355", name: "LUCAS BINI" },
    { code: "55384", name: "GILBERTO PERETTI" },
    { code: "55388", name: "JANIO LOPES DE SOUZA" },
    { code: "55405", name: "MARCELO RIBEIRO DE MENDONCA E OUTRA" },
    { code: "55408", name: "KARINA DIAS FELIPE VASCONCELOS" },
    { code: "55414", name: "MATHEUS FREITAS SGARBOSSA" },
    { code: "55419", name: "GABRIEL HENRIQUE CORTINA" },
    { code: "55510", name: "JOAO LUIZ PEDRACI RAMOS" },
    { code: "55547", name: "ARTHUR CARVALHO TRENTINI" },
    { code: "55548", name: "EVANDRO ROQUE THEISEN" },
    { code: "55553", name: "KLEBER VINICIUS DALLAGNOL" },
    { code: "55556", name: "JOSE TONTIM DOS SANTOS" },
    { code: "55558", name: "TONIAZZO EMPREENDIMENTOS LTDA - FILIAL" },
    { code: "55568", name: "CARINE ESTEFANE GONCALVES DA SILVA" },
    { code: "55576", name: "ERICK VINICIUS CARDOSO BINO" },
    { code: "55579", name: "LEONARDO BALDO" },
    { code: "55581", name: "ANDRE PIMENTEL" },
    { code: "55582", name: "RAFAEL HENKES" },
    { code: "55595", name: "PAULO HENRIQUE MORAES" },
    { code: "55598", name: "VICENTE BISSONI NETO E OUTROS" },
    { code: "55605", name: "GILBERTO ALEXANDRE CRISTIANO DE O. CUNHA" },
    { code: "55606", name: "VITORINO RODRIGUES DOS PASSOS" },
    { code: "55612", name: "JOSE DOMINGOS NETO" },
    { code: "55613", name: "JBJ AGROPECUARIA LTDA" },
    { code: "55619", name: "LEANDRO TEIXEIRA" },
    { code: "55621", name: "DANIEL DE SOUSA BRANQUINHO E OUTRA" },
    { code: "55622", name: "DAMIAO COSTA DE ARAUJO E OUTROS" },
    { code: "55632", name: "LEANDRO ANTONIO BOJARSKI LTDA" },
    { code: "55637", name: "PAULO GONCALVES DOS SANTOS" },
    { code: "55639", name: "VOLMAR JOSE MAGGIONI" },
    { code: "55640", name: "FERNANDO TREVISAN" },
    { code: "55641", name: "FELIPE DEI RICARDI" },
    { code: "55643", name: "JOAO BATISTA DE SOUSA FARIA" },
    { code: "55645", name: "HENRIQUE FERRAREZE BECK" },
    { code: "55647", name: "RANDIS MAYRE" },
    { code: "55651", name: "AFONSO DE OLIVEIRA CARVALHO" },
    { code: "55667", name: "MARCOS NEIS" },
    { code: "55675", name: "MILSON LONGUINHO RODRIGUES" },
    { code: "55682", name: "MARCELO SOUZA DUARTE" },
    { code: "55684", name: "CLAUDIO AUGUSTO DINI" },
    { code: "55686", name: "HIDRAULICA GAUCHA LTDA" },
    { code: "55688", name: "VENICIUS PIVOTTO" },
    { code: "55690", name: "L C J GALLE E CIA LTDA ME" },
    { code: "55692", name: "3SB PRODUTOS AGRICOLAS S.A." },
    { code: "55693", name: "ODIL PEREIRA CAMPOS FILHO" },
    { code: "55696", name: "CARLOS OLIVEIRA DE VASCONCELOS" },
    { code: "55699", name: "MAGNO JUNIOR CARAFINI" },
    { code: "55701", name: "PAULO SERGIO RODRIGUES DE FARIAS" },
    { code: "55704", name: "BRUNO SANCHES TORO" },
    { code: "55705", name: "RAYSSA SILVA MORAIS" },
    { code: "55708", name: "PAULO HENRIQUE CARLOS DE OLIVEIRA" },
    { code: "55711", name: "LEONARDO MEDEIROS TELES" },
    { code: "55713", name: "NOEMI LOURDES SOKOLOWSKI" },
    { code: "55720", name: "NARA MARIA CAMPOS DIAS" },
    { code: "55721", name: "MENON DE OLIVEIRA CARVALHO E OUTRO" },
    { code: "55722", name: "CLEUCIR FRAPORTTI" },
    { code: "55736", name: "KAPPES E KAPPES LTDA" },
    { code: "55739", name: "GERALDA RODRIGUES DA SILVA" },
    { code: "55754", name: "NILSON BONADIO" },
    { code: "55758", name: "NEILIMAR BRAZ RIBEIRO" },
    { code: "55759", name: "KELISMAR NOGUEIRA ROMA" },
    { code: "55762", name: "AGRO BAGGIO MAQUINAS AGRICOLAS LTDA" },
    { code: "55764", name: "ROGIMAR RUARO" },
    { code: "55768", name: "SADI ANGELO PALHARINI" },
    { code: "55774", name: "AGROPECUARIA ITAQUERE DO ARAGUAIA LTDA" },
    { code: "55777", name: "VIRGILIO RODRIGUES LELES CRUVINEL" },
    { code: "55781", name: "MILTON INACIO KRENCZINSKI E OUTRA" },
    { code: "55786", name: "FERNANDO ANTONIO DA SILVA LOPES" },
    { code: "55791", name: "ANACLETO RODRIGUES AGUIAR NETO" },
    { code: "55795", name: "AGROPECUARIA ITAQUERE DO ARAGUAIA LTDA" },
    { code: "55798", name: "FABIO ROGERIO BRUNETTA ME" },
    { code: "55800", name: "LUIS PAULO ANESE" },
    { code: "55807", name: "BOM FUTURO AGRICOLA LTDA" },
    { code: "55810", name: "FRANCISCO FELINI E OUTRA" },
    { code: "55812", name: "RAMIRO DIAS BRANCO ALVES" },
    { code: "55819", name: "CLESIO ANTONIO MARQUES FILHO" },
    { code: "55829", name: "AGROPECUARIA ITAQUERE DO ARAGUAIA LTDA" },
    { code: "55832", name: "RC AGRO SERVICOS LTDA" },
    { code: "55841", name: "ARCEDINO MACHADO NETO" },
    { code: "55845", name: "EDISON AUGUSTO DE OLIVEIRA" },
    { code: "55846", name: "DEISE CRISTINA BISSONI SACHETTI E OUTROS" },
    { code: "55850", name: "BELARMINO PRADO DE SOUSA" },
    { code: "55851", name: "EZEQUIEL STRUCKER" },
    { code: "55868", name: "AGROPECUARIA ITAQUERE DO ARAGUAIA LTDA" },
    { code: "55872", name: "DHEISSY KELLY NICOLAI" },
    { code: "55878", name: "MARCELLO PABLO HARTKOPE REGELIN" },
    { code: "55889", name: "FELIPE DA MOTTA SZARESKI" },
    { code: "55910", name: "VICTOR CALEBE MOREIRA DOS SANTOS" },
    { code: "55911", name: "JOAO VICENTE DE BONA" },
    { code: "55957", name: "LEODACI MARIA RISCAROLLI" },
    { code: "55958", name: "ALBERTO MACHADO DA SILVEIRA" },
    { code: "55966", name: "FAUSTO DA SILVEIRA" },
    { code: "55977", name: "RAFAEL SAITO MOREIRA" },
    { code: "55978", name: "TRACBEL AGRO COMERCIO DE MAQUINAS AGRICOLAS LTDA" },
    { code: "56023", name: "AGROSB AGROPECUARIA SA" },
    { code: "56060", name: "FERNANDO BERTOLDI" },
    { code: "56061", name: "FABIO BERTOLDI" },
    { code: "56079", name: "CARLOS ANTONIO DA SILVA" },
    { code: "56082", name: "ADERSON MARQUES PEIXOTO" },
    { code: "56085", name: "COOPERATIVA DOS PRODUTORES DE LEITE DE C" },
    { code: "56159", name: "OSCAR DELGADO GUTIERREZ" },
    { code: "56160", name: "MARCO AURELIO BARBOSA" },
    { code: "56221", name: "GUSTAVO NUNES TOME DE SOUZA" },
    { code: "56223", name: "LUCIANI DESSBESSEL" },
    { code: "56253", name: "ANDERSON BURNIER E OUTROS" },
    { code: "56264", name: "SIERENTZ AGRO BRASIL LTDA" },
    { code: "56265", name: "FERNANDO DOS SANTOS SILVA" },
    { code: "56289", name: "CESAR PEREIRA ALVES" },
    { code: "56296", name: "ADAIR ANTONIO BRESSAN" },
    { code: "56303", name: "CLAUDIO ULMER" },
    { code: "56314", name: "URSULA GABE" },
    { code: "56316", name: "ANTONIO LUIZ GIULIANGELI" },
    { code: "56323", name: "FLAVIO ADALBERTO TIEMANN JUNIOR" },
    { code: "56330", name: "EBO AGROPECUARIA S.A" },
    { code: "56340", name: "ARBAZA  ALIMENTOS LTDA" },
    { code: "56355", name: "JOSE ANTONIO BALCONI" },
    { code: "56363", name: "JOSE LUIZ FACCO STEFANELLO" },
    { code: "56380", name: "JOLCENIR RAVANELLI" },
    { code: "56394", name: "MAURO MARTINS FONTES FILHO" },
    { code: "56412", name: "MARIA MADALENA MACHADO DE SOUZA" },
    { code: "56414", name: "VASCO MIL HOMENS ARANTES FILHO" },
    { code: "56418", name: "JOSE LUIZ HANCHUCK" },
    { code: "56419", name: "CARLOS DIEGO FRANZIN" },
    { code: "56421", name: "DIHEGO MOURA SOUZA" },
    { code: "56428", name: "MACPONTA MAQUINAS AGRICOLAS LTDA" },
    { code: "56445", name: "EVERALDO PERES DOMINGUES JUNIOR" },
    { code: "56456", name: "TARCISIO LUIS CORBARI" },
    { code: "56462", name: "FERNANDO DE JESUS LUZ" },
    { code: "56468", name: "MANOEL FERREIRA SOUZA" },
    { code: "56470", name: "ATRHOL  AGENCIA E TRANSPORTES HORIZONTI" },
    { code: "56471", name: "ROSANGELA PAULINO FEITOSA" },
    { code: "56477", name: "ALY GRAEBIN OLIVEIRA" },
    { code: "56483", name: "TONIMAR ANDRADE DOS SANTOS" },
    { code: "56486", name: "LEANDRO RESENDE CRUVINEL" },
    { code: "56493", name: "FLAVIO BATISTA CRUZ" },
    { code: "56496", name: "SOLY PEREIRA JUNIOR" },
    { code: "56502", name: "FRANK MACEDO" },
    { code: "56505", name: "ALADINO SELMI NETO" },
    { code: "56520", name: "OSMIR JOSE DALMOLIN E OUTROS" },
    { code: "56525", name: "MAURICIO DELLAI" },
    { code: "56530", name: "SERGIO LUIZ XAVIER SERONI" },
    { code: "56541", name: "RICARDO EUGENIO PALMEIRA" },
    { code: "56555", name: "COCAMAR MAQUINAS AGRICOLAS LTDA" },
    { code: "56556", name: "ORACILIO FERREIRA BARBOSA" },
    { code: "56565", name: "NOIME FRANCISCO DA SILVA FILHO" },
    { code: "56576", name: "LEANDRO PEREIRA LUKASZESKI" },
    { code: "56594", name: "LIDIA DE SOUZA DE OLIVEIRA" },
    { code: "56610", name: "FRANCO LUIZ DIAS DE OLIVEIRA" },
    { code: "56632", name: "ALVORADA SISTEMAS AGRICOLAS LTDA" },
    { code: "56643", name: "JULIANO TOSTA DETONI" },
    { code: "56646", name: "EDERSON STIPP" },
    { code: "56650", name: "JOAO LEVISKI" },
    { code: "56674", name: "LEONIDAS GOMES MACHADO" },
    { code: "56708", name: "NUNCIA CONCEICAO SANTOS BRITO" },
    { code: "56724", name: "LUIZ CARLOS UEZER MENDES" },
    { code: "56731", name: "O TELHAR AGROPECUARIA LTDA" },
    { code: "56738", name: "SLC AGRICOLA CENTRO OESTE S A" },
    { code: "56739", name: "MALAQUIAS JOEL DANIELLI E OUTROS" },
    { code: "56743", name: "AGRIFIRMA  AGRO LTDA" },
    { code: "56750", name: "GELSON AFONSO TRES" },
    { code: "56758", name: "GEISA FERREIRA SOUSA CRUVINEL" },
    { code: "56771", name: "JHONATAN LOSS" },
    { code: "56780", name: "RUBENS PEREIRA DE ARAUJO NETO" },
    { code: "56799", name: "ROBERTO CURY" },
    { code: "56816", name: "ZELIA BARBOSA DE SOUZA SAGGIN" },
    { code: "56819", name: "JOAO BOSCO DE REZENDE" },
    { code: "56830", name: "JOSE FUSCALDI CESILIO NETO" },
    { code: "56850", name: "ANTONIO RICARDO GRITZENCE" },
    { code: "56851", name: "AGROTERENAS SA CANA" },
    { code: "56870", name: "LEOCI FAVARIN" },
    { code: "56871", name: "AGRICULTURA E PECUARIA CAMPONOVENSE LTDA" },
    { code: "56880", name: "SERGIO LISA DE FIGUEIREDO" },
    { code: "56916", name: "JOAO PRADO DOS SANTOS" },
    { code: "56917", name: "FAUSTO VINICIUS DE GUIMARAES GARCIA" },
    { code: "56924", name: "JOAO ORALDO MENDES" },
    { code: "56934", name: "GABRIEL FERREIRA CARVALHO" },
    { code: "56941", name: "EVERTO BARROS DA SILVA" },
    { code: "56984", name: "JULIANO ESTEVAN DIAS RIBEIRO" },
    { code: "56985", name: "GILSON BOMBARDA" },
    { code: "56992", name: "MATEUS GUILHERME SERVILHERI" },
    { code: "56995", name: "ROMULO ANTONIO VASSOLER" },
    { code: "57014", name: "RENATO GABRIEL CARO SOUZA" },
    { code: "57028", name: "LIMAGRAIN BRASIL S A" },
    { code: "57031", name: "MANOEL JOSE NUNES NETO" },
    { code: "57041", name: "MARCELO EDUARDO PASQUALOTTI" },
    { code: "57090", name: "FABIO SILVEIRA BARROS" },
    { code: "57094", name: "FLAVIO FOSCHIERA" },
    { code: "57098", name: "CARLOS EDUARDO ANTONIOLLI" },
    { code: "57104", name: "ORLANDO ALVES DE SOUZA" },
    { code: "57112", name: "TIAGO ANTONIO DE SOUZA DANTAS" },
    { code: "57124", name: "MURILO SILVERIO MARTINS BRITO" },
    { code: "57140", name: "IARA INES BAGESTAO" },
    { code: "57155", name: "XINGU PESQUISA E CONSULTORIA AGR. LTDA" },
    { code: "57163", name: "CARITA PEREIRA ALVES" },
    { code: "57172", name: "BRUNNO YURI MOREIRA" },
    { code: "57182", name: "JOSE ADSON DE SOUZA" },
    { code: "57195", name: "DENNIS ALVES DE SOUSA" },
    { code: "57206", name: "VILMO FAUSTINO TIZZO" },
    { code: "57246", name: "ZAQUEU MONTEIRO DOS SANTOS" },
    { code: "57248", name: "LUIZ VICENTE BUSATTO" },
    { code: "57251", name: "FLAVIO FAEDO" },
    { code: "57264", name: "ALBERTO KAPUSTA E OUTROS" },
    { code: "57268", name: "NALYS SILVEIRA GUERREIRO" },
    { code: "57270", name: "NEURI ZUFFO E CIA LTDA" },
    { code: "57273", name: "JOSE JOAO RODRIGUES REGES" },
    { code: "57286", name: "ODIMILSON FRANCISCO SIMOES" },
    { code: "57320", name: "FERNANDO ROMAGNOLI ROSSETO" },
    { code: "57322", name: "RUBEM ROCHA KUBELKE" },
    { code: "57328", name: "VILSON ARAUJO LIMA" },
    { code: "57331", name: "IDELTON MESQUITA SILVA FILHO" },
    { code: "57332", name: "ALEIXO LUCINDO DE SOUZA NETO" },
    { code: "57334", name: "ITAPURA AGROPECUARIA LTDA" },
    { code: "57335", name: "AILTO JOSE SANTANA" },
    { code: "57338", name: "EDVAL ZAFALON" },
    { code: "57339", name: "EDUARDO MUSA DE FREITAS GUIMARAES" },
    { code: "57345", name: "KAVUCO TERREAPLANAGEM" },
    { code: "57347", name: "VINICIUS FARIA DOS SANTOS" },
    { code: "57356", name: "ANTONIO GONCALVES MENDONCA" },
    { code: "57373", name: "COMPANHIA AGROPECUARIA SETE BARRAS LTDA" },
    { code: "57377", name: "LUIS ANDRE NEGRI" },
    { code: "57383", name: "ENIO LOPES CARDOSO" },
    { code: "57386", name: "DANIEL MIGUEL DA SILVA" },
    { code: "57390", name: "SULEMAR FREITAS SILVA" },
    { code: "57394", name: "FLAVIO VIANA" },
    { code: "57397", name: "JOSE VIDAL DE OLIVEIRA" },
    { code: "57402", name: "JOSE LUCAS NEVES FELICIO" },
    { code: "57405", name: "EDMAR MARTINS DE SOUSA JUNIOR" },
    { code: "57407", name: "WILLIAN HENRIQUE RECHE" },
    { code: "57409", name: "NELIDA CREMM PAVESI E OUTROS" },
    { code: "57413", name: "CAMILO RAMOS" },
    { code: "57418", name: "FABIANO GONCALVES MARINHO" },
    { code: "57426", name: "CLAUDECIR GUBERT E OUTRA" },
    { code: "57436", name: "MARCOS ANTONIO GASPARELLI E OUTROS" },
    { code: "57442", name: "JOSE RENATO DE FREITAS ALMEIDA II E OUTR" },
    { code: "57449", name: "VALMIRO ABADIAS LEAO" },
    { code: "57455", name: "REGINA MARIA OLIVEIRA DA SILVA" },
    { code: "57456", name: "WALTER SILVEIRA" },
    { code: "57458", name: "GABRIELA  LEMOS DA SILVA TRENTINI" },
    { code: "57472", name: "MARGHERITA CRISTINA M.F CORTI DI RETORBI" },
    { code: "57473", name: "FERNANDO CESAR PIRES BARBOSA" },
    { code: "57482", name: "RODRIGO NOGUEIRA LIMA" },
    { code: "57484", name: "ROGERIO CARVALHO CABRAL" },
    { code: "57495", name: "JOSE DONISETE VIDOTTI" },
    { code: "57501", name: "JOAO PAULO CALGARO" },
    { code: "57504", name: "MARIO LUIZ DA SILVEIRA" },
    { code: "57514", name: "MOACIR DE FREITAS GOUVEIA" },
    { code: "57520", name: "FERNANDO AGUIAR PINHEIRO" },
    { code: "57545", name: "VALMIR SECCO" },
    { code: "57554", name: "KELI BILIBIO CESCA E OUTROS" },
    { code: "57566", name: "EDSON ROSA CABRAL" },
    { code: "57570", name: "UILSON PERES TUBIAS" },
    { code: "57573", name: "SEBASTIAO DANIEL RAMOS" },
    { code: "57580", name: "VALDOMIRO DALBELLO" },
    { code: "57587", name: "LUCAS LANCHA MEI A. DE OLIVEIRA E OUTRO" },
    { code: "57590", name: "REONOLDO FURQUIM ROCHA" },
    { code: "57595", name: "EDENILSON SEBASTIAO BOCCHI" },
    { code: "57606", name: "MARISTELA ROSA VALIM DE NORONHA" },
    { code: "57616", name: "E.BERNINI COLHEITAS" },
    { code: "57623", name: "PAULO HENRIQUE SILVA LUI" },
    { code: "57628", name: "LUIS AUGUSTO ROSA VALIM" },
    { code: "57633", name: "GELSIO TEIXEIRA" },
    { code: "57634", name: "MAURO FORGERINI" },
    { code: "57644", name: "PAULO HENRIQUE GOULART FERNANDES DIAS" },
    { code: "57646", name: "HELVIO VASQUES DE SOUZA" },
    { code: "57648", name: "SANDRO QUIRINO SANTOS" },
    { code: "57651", name: "SLC MAQUINAS LTDA" },
    { code: "57653", name: "JOSE FRANCISCO PALUDO" },
    { code: "57655", name: "DURVAL LAURINDO" },
    { code: "57658", name: "JOAO CEZAR  ROHDEN" },
    { code: "57662", name: "RODRIGO DA PENHA SOARES AGUIAR" },
    { code: "57671", name: "TALISMA  AGRICOLA LTDA ME" },
    { code: "57695", name: "JULIAGRO B G  P LTDA" },
    { code: "57699", name: "ANDRE RIVA E OUTRO" },
    { code: "57703", name: "HUMBERTO TAROZZO FILHO E OUTRA" },
    { code: "57706", name: "ANA PAULA FREITAS MACHADO" },
    { code: "57708", name: "RONALDO MORAES MUNDIM" },
    { code: "57711", name: "TIAGO FRANCO BERNARDES" },
    { code: "57712", name: "JOSE UILSON FELIX DE SOUZA" },
    { code: "57715", name: "ZELMA AMORIM MARTINS DINIZ" },
    { code: "57723", name: "JOAO EVANDER ALVES DA SILVA" },
    { code: "57734", name: "RAFAEL CARVALHO MIRANDA MARTINS" },
    { code: "57738", name: "EVERALDO PERES DOMINGUES E OUTRO" },
    { code: "57743", name: "NOVA PIRATININGA EMPREENDIMENTOS, PARTIC" },
    { code: "57748", name: "LEONARDO CARAFFINI" },
    { code: "57759", name: "JONAS DE OLIVEIRA MENDES" },
    { code: "57763", name: "STEFANIO MACEDO FERREIRA" },
    { code: "57769", name: "GIRSINEI MEES" },
    { code: "57772", name: "RAMILO BELLO" },
    { code: "57775", name: "VINICIUS BORGES LEAL SARAGIOTTO" },
    { code: "57789", name: "WESLEY ALVES FERREIRA" },
    { code: "57799", name: "ARNALDO HELENO PIRES" },
    { code: "57812", name: "ANISIO VILELA JUNQUEIRA NETO" },
    { code: "57815", name: "ELIS REGINA MACHIA E OUTRAS" },
    { code: "57816", name: "CINTIA MARIA GONCALVES OLIVEIRA" },
    { code: "57822", name: "JOSE HENRIQUE DE ARAUJO" },
    { code: "57829", name: "GREGOREO CARVALHO INACIO CARDOSO" },
    { code: "57837", name: "DIRCEU FERNANDO KOHLER" },
    { code: "57839", name: "SILVANA MARIA DE CASTRO" },
    { code: "57846", name: "CLEBER LUIZ MEDEIROS DE LIMA" },
    { code: "57847", name: "ALFREDO DE SOUZA PARENTE FILHO" },
    { code: "57849", name: "MARCOS PEREIRA DE AMORIM" },
    { code: "57850", name: "ANTONIO ELMO FERREIRA" },
    { code: "57852", name: "GILBERTO RODRIGUES FREITAS" },
    { code: "57861", name: "LUAN APARECIDO VITORIANO SILVA" },
    { code: "57866", name: "EDSON GARCIA DE SOUZA" },
    { code: "57868", name: "SOLANGELA MARTINS PIOVEZAN RIBAS" },
    { code: "57873", name: "FERNANDO VILELA" },
    { code: "57874", name: "RICARDO NUNES COELHO E OUTROS" },
    { code: "57897", name: "ADRIANO MARCOS LOPES E OUTROS" },
    { code: "57901", name: "LEOCIR SPULDARO" },
    { code: "57955", name: "HALISSON BITTENCOURT FERNANDES" },
    { code: "57967", name: "AGROPECUARIA SG LTDA" },
    { code: "57977", name: "ERNESTO SITTA FILHO" },
    { code: "57990", name: "EDSON DIVINO CARDOSO DA SILVA" },
    { code: "57997", name: "WESLEY CARLOS AZEVEDO MACHADO" },
    { code: "58003", name: "ALCIONE LIMA LEITE LOBO" },
    { code: "58005", name: "DIOGO SARDINHA DE ALMEIDA" },
    { code: "58011", name: "GUILMAR FERREIRA" },
    { code: "58017", name: "AFONSO SANTANA DE ARAUJO" },
    { code: "58030", name: "GIVALDO RODRIGUES PEREIRA" },
    { code: "58031", name: "ROSIMEIRE APARECIDA SOARES DE SOUZA" },
    { code: "58039", name: "DALTON JAYME DE VASCONCELOS LOBO" },
    { code: "58043", name: "DANILO AIMI" },
    { code: "58054", name: "MAURO JOSE RAUBER" },
    { code: "58071", name: "ENIA DINIZ BORGES" },
    { code: "58091", name: "JANDER JOSE QUEIROZ FRANCO" },
    { code: "58095", name: "WENNER LOURIVAL SILVA  OLIVEIRA" },
    { code: "58101", name: "LUCAS VIVAN" },
    { code: "58103", name: "VALMIR DELL OSBEL" },
    { code: "58105", name: "W. MICOLINO  AUTO ELETRICA 2 IRMAOS" },
    { code: "58122", name: "THIAGO DE MACEDO SOUZA E OUTRO" },
    { code: "58125", name: "AGROPECUARIA SANTA OLIMPIA LTDA" },
    { code: "58126", name: "CECILIA SANGALETTI ANESE" },
    { code: "58156", name: "FERNANDO ROSSI DE OLIVEIRA" },
    { code: "58198", name: "ALEXANDRE JACQUES BOTTAN" },
    { code: "58199", name: "IVOMAR VICENTE FONTES" },
    { code: "58206", name: "MAURI SILVIO ROSSI" },
    { code: "58211", name: "ANTONIO KAZUMI SATO" },
    { code: "58213", name: "LEANDRO BECKER" },
    { code: "58216", name: "PIERRE MARTINS REZENDE" },
    { code: "58220", name: "ADILSON LIMA DE OLIVEIRA" },
    { code: "58222", name: "MARIA DAS DORES SANTOS DE ALMEIDA" },
    { code: "58243", name: "ELITON MARCOS DUARTE" },
    { code: "58247", name: "ELTON KIKUTI CAPEL" },
    { code: "58267", name: "MARCELO ORLANDO" },
    { code: "58271", name: "JOSE INACIO AMERICO DE SOUZA  FILHO E OU" },
    { code: "58276", name: "ANGELA BRANDELERO KLEIN" },
    { code: "58279", name: "CARLOS HENRIQUE ALVES DE FREITAS" },
    { code: "58284", name: "JULIANO APARECIDO CREMM E OUTROS" },
    { code: "58293", name: "FERNANDO INACIO CARDOSO" },
    { code: "58317", name: "BERNARDUS HUBERTUS SCHOLTEN" },
    { code: "58321", name: "GRAO DA FAZENDA LTDA" },
    { code: "58323", name: "CLAUDIA ELIANE SCHNEIDER K.D ROSA" },
    { code: "58335", name: "ADAM CARRIEL DIJKSTRA E OUTRO" },
    { code: "58339", name: "KLEBER WESSEL PAVESI E OUTRA" },
    { code: "58347", name: "RC AGRO COMERCIO E SERVICOS LTDA" },
    { code: "58356", name: "CAROLINE MICHELS VILELA" },
    { code: "58362", name: "MARCO AURELIO MULLER" },
    { code: "58366", name: "THIAGO SILVESTRE MAGGIONI" },
    { code: "58369", name: "WALDOMIRO ALVES ACACIO" },
    { code: "58385", name: "AGRINORTE LTDA" },
    { code: "58391", name: "CARLOS MAGNO SILVA ARAUJO" },
    { code: "58394", name: "SLC AGRICOLA S A" },
    { code: "58404", name: "GUSTAVO GOMES POLOTTO" },
    { code: "58405", name: "FREDERICO LIGEIRO MEDEIROS" },
    { code: "58413", name: "TRANSILVA TRANSPORTES" },
    { code: "58445", name: "ARISTIDE AIMI E OUTRA" },
    { code: "58451", name: "MAXUELL SILVA ALVES" },
    { code: "58455", name: "AGRO+ RETIFICA DE MOTORES E BOMBAS INJET" },
    { code: "58456", name: "JOAO BATISTA CONSENTINI FILHO" },
    { code: "58460", name: "RUBENS FERREIRA DA CUNHA NETTO" },
    { code: "58463", name: "EREMI CIELO" },
    { code: "58475", name: "HENRIQUE SA DE MORAIS" },
    { code: "58484", name: "AGRO SUL COMERCIO DE GRAOS LTDA" },
    { code: "58519", name: "DIOGO MONTEIRO M. DE ALMEIDA CASTRO" },
    { code: "58527", name: "DIEGO FERREIRA DE ASSIS" },
    { code: "58533", name: "REONILDO DANIEL PRANTE" },
    { code: "58537", name: "LOURIVAL LUCIO DA SILVA" },
    { code: "58539", name: "GUSTAVO SILVA DE CARVALHO" },
    { code: "58554", name: "IVO CANDIOTTO" },
    { code: "58572", name: "IZOEL RODRIGUES DOS SANTOS COSTA" },
    { code: "58573", name: "AGROPECUARIA COSTA VERDE LTDA" },
    { code: "58584", name: "JALES GOUVEIA MORAES" },
    { code: "58587", name: "MARCIO JOSE DE SOUZA" },
    { code: "58591", name: "GUILHERME EVANGELISTA RODRIGUES DA SILVA" },
    { code: "58601", name: "ELVADIR ANTUNES DA SILVA" },
    { code: "58607", name: "JAIRO GOMES TEDESCO" },
    { code: "58619", name: "VALERIO TELES PIRES JUNIOR" },
    { code: "58630", name: "AGROPECUARIA FAZENDA SERRA AZUL LTDA" },
    { code: "58633", name: "FERNANDO HENRIQUE DA SILVA MORANDO" },
    { code: "58634", name: "DEDIHER RENATO SILVA MENDES" },
    { code: "58651", name: "AGRICERT AGRO MERCANTIL LTDA" },
    { code: "58660", name: "TECOHA AGROPECUARIA E PARTICIPACOES LTDA" },
    { code: "58661", name: "GEAN CARLOS CAUDURO" },
    { code: "58665", name: "ANTONIO CARLOS DE MORAES" },
    { code: "58669", name: "JBS CONFINAMENTO LTDA" },
    { code: "58680", name: "MICHAEL PICCININI" },
    { code: "58689", name: "NATANAEL MACHADO NAVES FILHO" },
    { code: "58695", name: "EDSON JOSE FERREIRA ARAUJO" },
    { code: "58702", name: "GLODIMAR PICCINIM" },
    { code: "58704", name: "JOAO JOSE CARASSATO" },
    { code: "58710", name: "CANROBERT DOMINGOS DA COSTA" },
    { code: "58726", name: "WILLIAM EDUARDO GOMM E OUTRO" },
    { code: "58735", name: "WILLIAM LENNO MULLER" },
    { code: "58744", name: "WANDER CARLOS DE SOUZA" },
    { code: "58747", name: "HIDRAULICA ARAGUAIA COMP.E SERV. HIDRAUL" },
    { code: "58748", name: "JOAQUIM JOSE DE ALMEIDA JUNIOR" },
    { code: "58750", name: "MARILIA CUNHA DA CAMARA RAMOS" },
    { code: "58752", name: "FERNANDO RODRIGUES RESENDE" },
    { code: "58753", name: "OSMAR MARTIGNAGO JR E CAROLYNE MARTIGNAG" },
    { code: "58775", name: "AYRES FURQUIM CABRAL JUNIOR" },
    { code: "58780", name: "NARCELOS BORGES GUERREIRO" },
    { code: "58794", name: "CESAR ANTONIO BATISTA DA SILVA" },
    { code: "58798", name: "LUCAS RODRIGUES SANTOS E OUTRA" },
    { code: "58806", name: "ROSANGELA APARECIDA DE SOUZA" },
    { code: "58807", name: "VALMIR AZZOLINI" },
    { code: "58822", name: "ANTONIO ELMO DARUI" },
    { code: "58832", name: "ILSE FLECK" },
    { code: "58834", name: "WANDA GOLDFELD DE MELO" },
    { code: "58837", name: "JANAINA MARACAIPES DA SILVA" },
    { code: "58860", name: "LUIS FERNANDO DOS SANTOS AGUIAR" },
    { code: "58873", name: "LUIS FERNANDO DE SOUZA E OUTROS" },
    { code: "58874", name: "MARCELO GONCALVES RODRIGUES" },
    { code: "58875", name: "JOSE ASSIS DE FREITAS" },
    { code: "58877", name: "INORIO AFONSO DIERINGS" },
    { code: "58879", name: "GERALDO ROBERTO MOSSIGNATO" },
    { code: "58882", name: "ALEXANDRE EUGENIO DA SILVA MESQUITA EOUT" },
    { code: "58893", name: "LEANDRO GUIMARAES SUGUIKAWA" },
    { code: "58900", name: "ALEX GOMES MOREIRA" },
    { code: "58937", name: "RICARDO CUNHA TEODORO" },
    { code: "58951", name: "PAULO RICARDO MONEZZI" },
    { code: "58959", name: "RICARDO AMERICO PETEK" },
    { code: "58966", name: "DRT PNEUS E DISTRIBUIDORA LTDA" },
    { code: "58968", name: "NORMELIO PELIZON" },
    { code: "58970", name: "CEREAL OURO AGROPECUARIA LTDA" },
    { code: "58981", name: "SIDNEI PAULO PIOVESAN" },
    { code: "58987", name: "JOSELAINE PEREIRA DA CONCEICAO PASQUAL" },
    { code: "58988", name: "JOEL THIAGO HORN" },
    { code: "58990", name: "ROSELENE PEREIRA DE PAULA FERNANDES" },
    { code: "58998", name: "CARLOS DAVID DALCIN BAPTISTELLA" },
    { code: "59012", name: "TULIO FAE GHELLER" },
    { code: "59021", name: "FERNANDES SILAGEM E TRANSPORTES LTDA" },
    { code: "59035", name: "GUILHERME LUIZ DO VAL E OUTRA" },
    { code: "59044", name: "CLAUDIA GUIMARAES DA SILVA" },
    { code: "59047", name: "VICTOR SWART" },
    { code: "59055", name: "LEONARDO CARVALHO REZENDE" },
    { code: "59063", name: "ZELOIR REGIS ZIENTARSKI" },
    { code: "59073", name: "LEANDRO JOSE ROSSO" },
    { code: "59075", name: "HELIO RIBEIRO SATELIS" },
    { code: "59077", name: "JESSICA GABE" },
    { code: "59078", name: "J K TERRAPLANAGEM LTDA" },
    { code: "59093", name: "LUCAS DIEGO BISCARO E OUTRO" },
    { code: "59095", name: "AUKE DIJKSTRA" },
    { code: "59099", name: "MARCIANE FATIMA KROTH" },
    { code: "59102", name: "FABRICIO REZENDE RIBEIRO DA COSTA" },
    { code: "59106", name: "FABRICIO SILVA  AROUCHA" },
    { code: "59107", name: "JOAO UMBELINO CRUVINEL" },
    { code: "59110", name: "SANDRA CARINA KLEIN" },
    { code: "59118", name: "RODRIGO ANTONIO GOMES" },
    { code: "59125", name: "ANTONIO CARLOS MORETTI" },
    { code: "59127", name: "BRASILAGRO CIA.BRASILEIRA DE PROP.A" },
    { code: "59137", name: "GUSTAVO BARBOSA GORGEN" },
    { code: "59146", name: "OCRECIO MARQUEZ MACEDO JUNIOR" },
    { code: "59149", name: "VINICIUS JOAO CURI" },
    { code: "59173", name: "NEREU LUNKES" },
    { code: "59176", name: "MAESTRO LOCADORA DE VEICULOS" },
    { code: "59178", name: "JHONY JORGE SPRICIGO BIF E OUTRO" },
    { code: "59184", name: "AGRO CARAJAS LTDA" },
    { code: "59197", name: "PAULO CESAR BOTTOLI" },
    { code: "59199", name: "JRPF SERVICOS DE MANUTENCAO DE MAQUINAS" },
    { code: "59213", name: "ADIMAR RODRIGUES JUNIOR" },
    { code: "59222", name: "ALEX ANTONIO TIZZO" },
    { code: "59225", name: "RICARDO BRIZOT NICARETTA" },
    { code: "59229", name: "ANDREA LOURENCO DE ARAUJO" },
    { code: "59242", name: "MAGNO RIBEIRO BORGES" },
    { code: "59270", name: "LUIZ GUSTAVO BARBOSA DE OLIVEIRA" },
    { code: "59274", name: "BRUNO BARBOSA RODRIGUES" },
    { code: "59287", name: "JOAO PAULA DE QUEIROZ" },
    { code: "59294", name: "PAULO HENRIQUE CARVALHO BORGES" },
    { code: "59298", name: "ADOLFO GONCALVES JORCELINO JUNIOR" },
    { code: "59304", name: "ALDO FILHO TIMOTEO DA CONCEICAO" },
    { code: "59314", name: "RODRIGO SANTOS PEIXOTO" },
    { code: "59319", name: "EMSB PARTICIPACOES SOCIETARIA INV.EMPREN" },
    { code: "59332", name: "VANAZZI SERV DE CULTIVO E COLHEITA LTDA" },
    { code: "59334", name: "LUCINEA VILELA DE ASSIS" },
    { code: "59336", name: "DIEGO VINISSIOS JAZINSKI" },
    { code: "59345", name: "MARCIO VALDAIR SCHNEIDER" },
    { code: "59346", name: "SQR SERVICOS COLHEITAS LTDA" },
    { code: "59361", name: "JEDERSON ANTUNES DA SILVA" },
    { code: "59364", name: "ALENCAR SANTOS BURITI JUNIOR" },
    { code: "59376", name: "KLEBERSON ALVES DE OLIVEIRA" },
    { code: "59382", name: "KARINNE TRINDADE" },
    { code: "59398", name: "JOAO ISAQUE ALVES DE ARAUJO" },
    { code: "59404", name: "WELDON PAULO COSTA" },
    { code: "59424", name: "F C COLHEITAS E TRANSPORTES LTDA" },
    { code: "59435", name: "ALBA ALMEIDA RODRIGUES DE GODOY" },
    { code: "59441", name: "GIONGO PECUARIA SA" },
    { code: "59462", name: "ADILSON LUIZ IACOVANTUONI" },
    { code: "59475", name: "ANDREIA CRISTINA MICHELSON BRUNETTA LTDA" },
    { code: "59477", name: "INSTITUTO MATO-GROSSENSE DO AGRONEGOCIO" },
    { code: "59493", name: "ADRIANA SOUZA DE OLIVEIRA ARMAZENS LTDA" },
    { code: "59506", name: "CONSTRUTAO ENGENHARIA LTDA" },
    { code: "59517", name: "ANDRE LUIZ SALLES SCUTTI" },
    { code: "59529", name: "LH SERVICOS AGRICOLAS LTDA" },
    { code: "59530", name: "AGROPECUARIA TONIELLO LTDA" },
    { code: "59541", name: "GENESIS GROUP TICRM SERVICOS LTDA" },
    { code: "59544", name: "RODRIANA BERNARDO DA SILVA" },
    { code: "59548", name: "LUIS RENATO LOPES REZENDE" },
    { code: "59550", name: "MATEUS TISOTT" },
    { code: "59562", name: "FAGNER LUIZ PERETI" },
    { code: "59569", name: "RICHARD BIDOIA CARLOTTI" },
    { code: "59581", name: "MARIANA NORALINA TELLES PALUDO" },
    { code: "59597", name: "PEDRO MODESTO MAGGIONI" },
    { code: "59602", name: "MATEUS JOSE DOS SANTOS FILHO" },
    { code: "59607", name: "RAPHAEL LUIZ DE MOURA" },
    { code: "59611", name: "MARINALVA ALMEIDA DO NASCIMENTO CORREA" },
    { code: "59612", name: "RAFAEL LUIZ FAVORETO ALMEIDA" },
    { code: "59617", name: "SOLUCAO PNEU AGRO LTDA" },
    { code: "59624", name: "ARTUR ZANON" },
    { code: "59630", name: "J.M.J TERCEIRIZACOES AGRICOLAS LTDA" },
    { code: "59637", name: "DIONATAN PABLO TIBOLA" },
    { code: "59639", name: "MARCELO CAPRA" },
    { code: "59640", name: "GILBERTO ANTONIO GUERREIRO" },
    { code: "59648", name: "ITALO EMANUEL DE CARVALHO SILVA" },
    { code: "59670", name: "ENESIO ANTONIO DAVID" },
    { code: "59677", name: "CLACI GIACOMELLI" },
    { code: "59679", name: "NADIANA AGRONEGOCIOS LTDA" },
    { code: "59685", name: "LUIZ CARLOS CAPRA" },
    { code: "59693", name: "GRACIELA MARAIZA GALERA FREITAS" },
    { code: "59696", name: "COMERCIO E TRANSPORTES COMELLI LTDA" },
    { code: "59700", name: "MATHEUS MACHADO MEES" },
    { code: "59702", name: "GABRIEL FAVARAO FRANCISCO" },
    { code: "59708", name: "FERNANDO FLEURY CARVALHO SANTOS" },
    { code: "59710", name: "IDEAL TERRAPLANAGEM LTDA" },
    { code: "59711", name: "ANDRE MACHADO MEES" },
    { code: "59713", name: "ALBERTO ARNOLDO KUCHNIR" },
    { code: "59714", name: "DIOGENES FRIES" },
    { code: "59715", name: "WALMIR ROCHA CARRIJO" },
    { code: "59716", name: "VINICIUS FRANCO MACHADO" },
    { code: "59717", name: "FABRICIO FRIES" },
    { code: "59719", name: "MARCELO JONY SWART" },
    { code: "59720", name: "NELVO FRIES" },
    { code: "59724", name: "ANTONIO RIZZI JUNIOR" },
    { code: "59728", name: "LEANDRO LIVRAMENTO DA SILVA" },
    { code: "59730", name: "JOAO EDUARDO XAVIER RODRIGUES" },
    { code: "59731", name: "BRUNO VILELA SANDOVAL MOREIRA" },
    { code: "59738", name: "JOAQUIM SALGUEIRO FILHO" },
    { code: "59746", name: "FABIANA LEAO DOS SANTOS" },
    { code: "59751", name: "CINTIA AIMI" },
    { code: "59757", name: "CONSTRUTORA CAIAPO LTDA" },
    { code: "59765", name: "JOAQUIM ANTONIO DE REZENDE" },
    { code: "59768", name: "THOMAS DAVID TAYLOR PEIXOTO" },
    { code: "59771", name: "TEOFILO EVARISTO VILELA" },
    { code: "59772", name: "NILMAR HONORATO DA SILVA" },
    { code: "59780", name: "LUIS CARLOS GRANEMANN" },
    { code: "59781", name: "ELVIO SEVERINO PEREIRA" },
    { code: "59784", name: "VANESSA FRIES" },
    { code: "59785", name: "PAOLA VILELA SANDOVAL MOREIRA" },
    { code: "59791", name: "ESPOLIO ARLO FRANCISCO ALVES" },
    { code: "59793", name: "CAROLINE TEIXEIRA GAZARINI" },
    { code: "59794", name: "ALCENIR LEONEL DE SOUZA" },
    { code: "59795", name: "RENATO BONZANINI" },
    { code: "59798", name: "WERIC SILVA REZENDE" },
    { code: "59799", name: "BRUNO CESAR CARRIJO VILELA" },
    { code: "59808", name: "SANDRO MAGGIONI" },
    { code: "59809", name: "CHARLES LOUIS PEETERS" },
    { code: "59814", name: "QUEILIOMAR CARVALHO DOS SANTOS" },
    { code: "59819", name: "NATHALIA REZENDE BORGES" },
    { code: "59823", name: "SILVIO EVARISTO VILELA SOARES" },
    { code: "59824", name: "VINICIUS CARAFINI" },
    { code: "59833", name: "HYGINO PIACENTINI" },
    { code: "59842", name: "DIEGO GIONGO" },
    { code: "59856", name: "SAVIO TEODORO" },
    { code: "59872", name: "BRUNA OTILIA GUARESCHI BARION" },
    { code: "59894", name: "LIVIA REZENDE" },
    { code: "59895", name: "IZA PAULA CARVALHO DE SOUSA" },
    { code: "59906", name: "COOPERATIVA MISTA AGROPECUARIA DO VALE DO ARAGUAIA" },
    { code: "59907", name: "JOSE REZENDE CRUVINEL" },
    { code: "59909", name: "ALEX MACHADO REZENDE" },
    { code: "59915", name: "FLAVIO HENRIQUE MARCIANO CAMPOS DE SOUZA" },
    { code: "59921", name: "ANTONIO VALERIANO DE CARVALHO" },
    { code: "59929", name: "ELMIRO VIEIRA BORGES JUNIOR" },
    { code: "59941", name: "PEDRO PEREIRA DA CONCEICAO SILVA" },
    { code: "59945", name: "FABIO TEODORO CARRIJO" },
    { code: "59946", name: "FUNDACAO INTEGRADA MUNICIPAL DE ENSINO SUPERIOR" },
    { code: "59948", name: "GEANE CRISTINA DE SIQUEIRA SANTOS" },
    { code: "59952", name: "AECIO BONFIM MORAES CRUVINEL" },
    { code: "59954", name: "DOUGLAS JUNIOR TURCHETTI" },
    { code: "59969", name: "OSVALDO EVARISTO VILELA" },
    { code: "59978", name: "FRANCELINO MILHOMENS VILELA E OUTRA" },
    { code: "59982", name: "ALCIDES RESENDE CARVALHO" },
    { code: "60003", name: "CAROLINA COSTA NACRUTH GIONGO" },
    { code: "60020", name: "ARMAZENS GERAIS PARAISO LTDA" },
    { code: "60023", name: "OLDON MARTINS CARRIJO" },
    { code: "60030", name: "RODRIGO VILELA CARVALHO NOGUEIRA" },
    { code: "60039", name: "FABIO FIDELES REZENDE" },
    { code: "60043", name: "JOAO LINDOLFO TEODORO RODRIGUES" },
    { code: "60050", name: "JOSE MARIA CARREIRA" },
    { code: "60068", name: "GUILHERME FARIA VILELA" },
    { code: "60076", name: "HONORIO LEAO DE MORAES" },
    { code: "60077", name: "THIAGO ALVES PRATES" },
    { code: "60082", name: "JUAREZ CARLOS SILVA FILHO" },
    { code: "60092", name: "PREFEITURA MUNICIPAL DE MINEIROS" },
    { code: "60097", name: "PHELIPE LEAO MARTINS VILELA" },
    { code: "60098", name: "RAMIRO PEREIRA DE MATOS" },
    { code: "60101", name: "MULLER RODRIGUES REZENDE" },
    { code: "60105", name: "HELIO ROLLEMBERG TREFIGLIO" },
    { code: "60115", name: "FLAVIO RIBEIRO DE OLIVEIRA LEAO" },
    { code: "60135", name: "ALONSO CHAVES DE MORAIS" },
    { code: "60138", name: "NILTON CARVALHO DE SOUZA" },
    { code: "60148", name: "LUIS FERNANDO VILELA BECKER" },
    { code: "60150", name: "JURANDIR VILELA NETTO" },
    { code: "60155", name: "BRUNO KOHLRAUSCH CRESTANI" },
    { code: "60162", name: "FRANTCHESCO FERNANDES GIAPPICHINI" },
    { code: "60165", name: "FLAVIO ROBERTO TRENTIN" },
    { code: "60166", name: "FLAVIA MINOTTO MONTANS" },
    { code: "60215", name: "RAFAEL NASCIMENTO MAIA" },
    { code: "60227", name: "GUILHERME OLIVEIRA RODRIGUES" },
    { code: "60234", name: "RONE SERGIO DUARTE" },
    { code: "60237", name: "CRYSTOPHER FRIES" },
    { code: "60264", name: "MURILO NELSON PELIZON BRIANCINI" },
    { code: "60265", name: "PEDRO ALBA DE OLIVEIRA" },
    { code: "60266", name: "PEDRO HENRIQUE RESENDE MICHELS" },
    { code: "60275", name: "GABRIEL CARRIJO CARVALHO" },
    { code: "60279", name: "JAIRO FLAVIO DE CARVALHO" },
    { code: "60282", name: "MARCIANO CASAGRANDE" },
    { code: "60302", name: "GIORDANO RODRIGUES VILELA SOUZA" },
    { code: "60308", name: "DOURIVAN CRUVINEL DE SOUZA" },
    { code: "60313", name: "ELSON TOMAZ DE SOUZA" },
    { code: "60319", name: "THIAGO CARVALHO MATIAS" },
    { code: "60325", name: "LETICIA CARVALHO GRAEBIN MAIA" },
    { code: "60330", name: "AILLON KLASENER" },
    { code: "60333", name: "BRUNO RESENDE BARROS" },
    { code: "60350", name: "HELIO ROSA CABRAL JUNIOR" },
    { code: "60356", name: "BERTOLDO FRANCISCO DE ABREU JUNIOR" },
    { code: "60376", name: "D ALVES GARCIA  ME" },
    { code: "60402", name: "GODOFREDO CARVALHO DE CASTRO" },
    { code: "60404", name: "MURILO MARTINS SPERANDIO" },
    { code: "60405", name: "RICARDO CARVALHO CRUVINEL" },
    { code: "60406", name: "ANTONIO SOARES DA COSTA NETO" },
    { code: "60419", name: "JOAO BATISTA CARREIRA" },
    { code: "60422", name: "LEONARDO RESENDE DUTRA" },
    { code: "60450", name: "VIVALDO MACIEL DE OLIVEIRA NETO" },
    { code: "60470", name: "PEDRO ARTHUR TURCHETTI MOTT" },
    { code: "60484", name: "ANTONIO VIEIRA CRUVINEL" },
    { code: "60493", name: "VANIR POTRICH" },
    { code: "60494", name: "NELSON KNOP" },
    { code: "60499", name: "ALECIO RAMPAZZO NETO" },
    { code: "60502", name: "JOAQUIM ADARIO CARRIJO" },
    { code: "60506", name: "LOURENCO DE CARVALHO FRANCO" },
    { code: "60510", name: "LEANDRO LOPES PIMENTA" },
    { code: "60517", name: "MARIO MARIA MATEUS VAN DEN BROEK" },
    { code: "60520", name: "GABRIEL CARVALHO GOMES" },
    { code: "60536", name: "FLAVIO MARCHIO" },
    { code: "60555", name: "EDUARDO BERNINI" },
    { code: "60556", name: "DANIEL JOSE GHIGGI PEIXOTO" },
    { code: "60563", name: "LEONARDO DE OLIVEIRA COSTA" },
    { code: "60574", name: "RAFAEL BARROS DE ANDRADE" },
    { code: "60581", name: "WILHELMUS HENDRIKUS JOSEF KOMPIER" },
    { code: "60586", name: "ANTONIO FABIO NEGRI" },
    { code: "60611", name: "ITALIENE GOUVEIA DO CARMO OLIVEIRA" },
    { code: "60619", name: "DENISE REDOSCHI" },
    { code: "60624", name: "EVOLUCAO PRODUTOS AGROPECUARIOS LTDA" },
    { code: "60627", name: "ELIESER TEIXEIRA FILHO" },
    { code: "60628", name: "KOJI WATANABE" },
    { code: "60644", name: "V DA SILVA COSTA LTDA" },
    { code: "60657", name: "BRENCO COMPANHIA BRASILEIRA DE ENERGIA RENOVAVEL" },
    { code: "60663", name: "ARIOMAR REZENDE VILELA" },
    { code: "60666", name: "ERNESTO MACHADO DE REZENDE" },
    { code: "60673", name: "CAIO DE SOUSA PEREIRA LIMA" },
    { code: "60675", name: "EDESIO DA SILVA BARBOSA" },
    { code: "60677", name: "CERRADINHO BIONERGIA S.A." },
    { code: "60687", name: "RIO CLARO AGROINDUSTRIAL S.A." },
    { code: "60692", name: "SEBASTIANA PANIAGO VILELA RESENDE" },
    { code: "60694", name: "BEROCAN LIMA MACHADO" },
    { code: "60695", name: "JOSE CARLOS DA SILVA PORFIRIO" },
    { code: "60701", name: "JOSE CRISTOVAM MARTINS OLIVEIRA  ME" },
    { code: "60711", name: "IVANIR JOAO PAZINI" },
    { code: "60713", name: "SEBASTIAO CARREIRA" },
    { code: "60714", name: "RODRIGO LEITE DE MORAES" },
    { code: "60722", name: "VALTER RAMOS LTDA" },
    { code: "60730", name: "MAURICIO GARCIA DE ALMEIDA E OUTROS" },
    { code: "60732", name: "EDSON DE CARVALHO FRANCO" },
    { code: "60734", name: "ALEXANDRE BERNINI E OUTROS" },
    { code: "60739", name: "ATAYNA TAVARES MARCKS" },
    { code: "60744", name: "ALIANCA COMERCIO TRANSPORTES LOCACOES E SERVICOS LTDA" },
    { code: "60758", name: "SETIMO PASSINATO" },
    { code: "60767", name: "ADROALDO GUZZELA E OUTROS" },
    { code: "60779", name: "JOAO BATISTA CAMPOS" },
    { code: "60787", name: "BOM SUCESSO AGROINDUSTRIA LTDA" },
    { code: "60794", name: "ILMO BOLGENHAGEN" },
    { code: "60811", name: "RICARDO AFONSO SCHOLTEN" },
    { code: "60812", name: "MAURICIO BERNARDO SCHOLTEN" },
    { code: "60824", name: "DEUSDEDETH REZENDE BARBOSA" },
    { code: "60826", name: "EDSON HORBYLON CRUVINEL" },
    { code: "60828", name: "ALBERTO RODRIGUES DE REZENDE" },
    { code: "60842", name: "SILVIO DE CARVALHO RESENDE" },
    { code: "60848", name: "VALDIR ANTONIO NIEDERMEIER" },
    { code: "60858", name: "NILTON OVIDIO DE REZENDE" },
    { code: "60860", name: "BOISA E BOISA SERVICOS AGRICOLAS LTDA" },
    { code: "60867", name: "IMAGEM AGROPECUARIA LTDA" },
    { code: "60886", name: "VICTOR CEZAR PRIORI" },
    { code: "60897", name: "SIRLEI DE CARVALHO REZENDE" },
    { code: "60899", name: "ADERVANIL JOAQUIM DE REZENDE" },
    { code: "60906", name: "ARMANDO PRATO NETO" },
    { code: "60908", name: "RUBENS BATISTA DA ROCHA" },
    { code: "60910", name: "RETIFICA DE MOTORES MINEIRENSE LTDA" },
    { code: "60912", name: "IVO BOLGENHAGEN" },
    { code: "60923", name: "DIMAS RIBEIRO MARTINS JUNIOR" },
    { code: "60940", name: "MARIANGELICA SCHOENBERGER" },
    { code: "60941", name: "VIRGULINO BRIZI" },
    { code: "60942", name: "SEBASTIAO BATISTA DE MACEDO" },
    { code: "60944", name: "EURIDES BARALDO" },
    { code: "60947", name: "TARCISIO TEN KATHEN" },
    { code: "60956", name: "ANILDO JOSE BRIGNONI" },
    { code: "60959", name: "PAULO RENATO PANIAGO" },
    { code: "60973", name: "NILSON ALVES BORGES" },
    { code: "60975", name: "MOACIR DE ANDRADE JUNIOR" },
    { code: "60976", name: "FABIANO FERREIRA FERRARI" },
    { code: "60979", name: "S E T - SERVICOS ESPECIALIZADOS EM TERRAPLANAGEM LTDA" },
    { code: "60988", name: "LUIZ ROBERTO DE CARVALHO" },
    { code: "60989", name: "NATALICIO ONERIO DE REZENDE" },
    { code: "61012", name: "GUIOMAR BORGES DE CARVALHO" },
    { code: "61024", name: "ANTONIO BARCELOS DA ROCHA" },
    { code: "61032", name: "M E PERFOR MAQUINAS E EQUIP EIRELI EPP" },
    { code: "61034", name: "VALDEMAR OSVALDO GONCALVES" },
    { code: "61037", name: "FONTAINE RIBEIRO IRINEU" },
    { code: "61042", name: "JOSE FERNANDO DE CARVALHO" },
    { code: "61046", name: "MOACIR DALMOLIN" },
    { code: "61048", name: "JOSE LUIZ FERNANDES" },
    { code: "61054", name: "RENATO INACIO CARDOSO" },
    { code: "61059", name: "DIONISIO JOHANN" },
    { code: "61066", name: "ARNO ROMERO JALOWITZKI" },
    { code: "61074", name: "OLIDOMAR JOSE PALUDO" },
    { code: "61077", name: "DOMINGOS PASSINATO" },
    { code: "61078", name: "AREDISON SILVA DE ANDRADE" },
    { code: "61082", name: "RUTH REZENDE VILELA" },
    { code: "61086", name: "IRINEU CARLOS SCHWERTZ" },
    { code: "61093", name: "HELIO LUIS CRUVINEL" },
    { code: "61097", name: "IONALDO MORAES VILELA" },
    { code: "61098", name: "ANTONIO CARLOS CARVALHO DE CASTRO" },
    { code: "61102", name: "ROMILDO REZENDE OLIVEIRA" },
    { code: "61116", name: "MARIA GLORIA PRADO CLARIMUNDO" },
    { code: "61119", name: "JOSE DOS SANTOS OLIVEIRA" },
    { code: "61125", name: "ALVARO MARTIN HENKES" },
    { code: "61127", name: "JOAO PEREIRA DE CARVALHO" },
    { code: "61129", name: "ALBERTO DE OLIVEIRA CARVALHO" },
    { code: "61135", name: "LUIZ CARAFINI" },
    { code: "61137", name: "CLAUDEMIR SCHWENING" },
    { code: "61148", name: "SILVIO CUNHA BARCELOS" },
    { code: "61153", name: "RICARDO ALMEIDA MARTINS" },
    { code: "61174", name: "WALTER DELFINO MUNIZ" },
    { code: "61176", name: "ELTON SANDRI" },
    { code: "61182", name: "ODILON PINTO CADORE" },
    { code: "61183", name: "NAIRON OVIDIO DE REZENDE" },
    { code: "61186", name: "MILTON RESENDE OLIVEIRA" },
    { code: "61193", name: "MARIA FRANCISCA RODRIGUES REZENDE" },
    { code: "61196", name: "ELMIRO VIEIRA BORGES" },
    { code: "61212", name: "MARIA SOELI FERNANDES PERES" },
    { code: "61215", name: "ERNESTO VILELA REZENDE" },
    { code: "61217", name: "JERONIMO VALDECI JESUS MAGALHAES" },
    { code: "61219", name: "DELSO CARAFINI" },
    { code: "61225", name: "MILTON VILELA" },
    { code: "61227", name: "ANGELO FURQUIM CABRAL" },
    { code: "61229", name: "L C SERVICOS AGRICOLAS LTDA - ME" },
    { code: "61238", name: "JARBAS JUNIOR VILELA RIBEIRO" },
    { code: "61242", name: "CLOVIS VILELA RODRIGUES" },
    { code: "61246", name: "JOAQUIM RENATO PANIAGO" },
    { code: "61247", name: "EDILBERTO RESENDE SOUZA" },
    { code: "61249", name: "LORIVALDO VITORINO DE CARVALHO" },
    { code: "61260", name: "JORGE CUNHA CRUVINEL" },
    { code: "61271", name: "FAUSTO BRITO LUCIANO" },
    { code: "61278", name: "VALDO OLICIO DE RESENDE" },
    { code: "61281", name: "ADJARBAS RESENDE NAVES" },
    { code: "61285", name: "PEDRO LUIZ SCHOENBERGER" },
    { code: "61293", name: "EDGAR ROCHA VILELA" },
    { code: "61298", name: "LAURINDO AIMI" },
    { code: "61301", name: "FELIPE PASSINATTO" },
    { code: "61302", name: "FRANCISCO GOULART FERREIRA" },
    { code: "61304", name: "IVO KOPPER" },
    { code: "61305", name: "JOAO PEDRO MICHELS" },
    { code: "61307", name: "CELSO FRIES" },
    { code: "61315", name: "VALTENIO LEONEL DE SOUZA" },
    { code: "61316", name: "JOSE REZENDE CRUVINEL JUNIOR" },
    { code: "61317", name: "ERALDO RODRIGUES DE REZENDE" },
    { code: "61318", name: "ERNANI VILELA CRUVINEL" },
    { code: "61320", name: "MOACIR ALBERTO GUARESCHI" },
    { code: "61321", name: "WLADEMIR ANTONIO PIACENTINI" },
    { code: "61345", name: "LENIO VIEIRA GUIMARAES" },
    { code: "61346", name: "MILTON REZENDE SOUZA" },
    { code: "61351", name: "CARLOS ALBERTO PEREIRA DE REZENDE" },
    { code: "61352", name: "LAURO SEBASTIAO DE MORAIS" },
    { code: "61359", name: "MARCELO LEAO MARTINS" },
    { code: "61361", name: "IVAN RESENDE MARTINS" },
    { code: "61364", name: "JOAO HILDEBRANDO RESENDE SOUZA" },
    { code: "61365", name: "ROSELY PANIAGO VILELA" },
    { code: "61371", name: "RAIMUNDO NICOLAU DOS SANTOS" },
    { code: "61372", name: "AGRISERVICE AGRICOLA TURCHETTI LTDA" },
    { code: "61378", name: "ERCILO BELLO" },
    { code: "61386", name: "LUIZ ACADIO SCHERER" },
    { code: "61398", name: "URBANO CLARIMUNDO DE RESENDE JUNIOR" },
    { code: "61406", name: "CASSIO SITTA" },
    { code: "61431", name: "EDUARDO CARVALHO COLETO" },
    { code: "61432", name: "MAURICIO MARTINS CRUVINEL" },
    { code: "61433", name: "JOSE ANTONIO FREITAS" },
    { code: "61434", name: "MARCOS ANTONIO AMORIM VILELA" },
    { code: "61437", name: "LUIZ FERNANDO MATOS" },
    { code: "61438", name: "JOAO ANTONIO LIRA FERREIRA" },
    { code: "61450", name: "FLAVIO DE SOUZA REZENDE" },
    { code: "61452", name: "LIRIO JOSE PIACENTINI" },
    { code: "61474", name: "ADRIANO LOEFF" },
    { code: "61478", name: "BRUNA SCHLATTER ZAPPAROLI" },
    { code: "61481", name: "LUIZ UMBERTO LUZ" },
    { code: "61507", name: "VILMARIO BARBOSA CARNEIRO" },
    { code: "61510", name: "ORLANDO MARIA KOK" },
    { code: "61512", name: "GEORGE FONSECA ZAIDEN" },
    { code: "61518", name: "VITOR HUGO DAROS" },
    { code: "61528", name: "VILMAR DE JESUS LIMA" },
    { code: "61540", name: "ADEMILTON MORAES RESENDE" },
    { code: "61541", name: "SIGLENE SILVA REZENDE" },
    { code: "61542", name: "WESLEY CESAR DE PAULA" },
    { code: "61550", name: "MAXSUEL REZENDE LUCIANO" },
    { code: "61552", name: "JOSE HERMINIO CALEFFI MAGRO" },
    { code: "61557", name: "CARLOS PRADO DOS SANTOS" },
    { code: "61561", name: "MARCOS AURELIO NEGRI" },
    { code: "61562", name: "ARISA COSTA LIMA MONTES" },
    { code: "61564", name: "ANTONIO PEQUITO TAVARES" },
    { code: "61565", name: "JAIR ANTONIO REIDEL E CIA LTDA" },
    { code: "61570", name: "LAZARO ROBERTO CRUVINEL" },
    { code: "61573", name: "ROBSON CARVALHO VIEIRA" },
    { code: "61577", name: "LUIZ ANTONIO CARVALHO LUCIANO" },
    { code: "61582", name: "EDUARDO FERREIRA DE ANDRADE" },
    { code: "61591", name: "WEINER COSTA DUARTE" },
    { code: "61595", name: "ANTONIO MICHELS" },
    { code: "61599", name: "JOSE MARIO SCHREINER" },
    { code: "61600", name: "FERNANDO ANTONIO AMORIM VILELA" },
    { code: "61608", name: "AGROPECUARIA E PECUARIA TAIAMA LTDA" },
    { code: "61612", name: "RICARDO CALEFFI" },
    { code: "61613", name: "PAULO RICARDO DOS SANTOS JANISCH" },
    { code: "61614", name: "JOSE LIGABUE LOPES RIBEIRO" },
    { code: "61629", name: "JOSE CARLOS CINTRA" },
    { code: "61639", name: "HUMBERTO JOSE DE FARIA" },
    { code: "61642", name: "GIOVANI BARUFFI" },
    { code: "61648", name: "EDUARDO OLIVEIRA CARRIJO" },
    { code: "61653", name: "OSMAR SABAINE DALL AGO E OUTROS" },
    { code: "61656", name: "MARIO WALDIR ZUHL E OUTROS" },
    { code: "61663", name: "BISPO CASTILHO TRANSPORTE E SERVICOS AGRICOLAS LTDA" },
    { code: "61672", name: "RICARDO SOUSA SANTOS" },
    { code: "61699", name: "JACKSON NIVALDO TEODORO" },
    { code: "61712", name: "MAURO RESENDE MORAES" },
    { code: "61721", name: "EVANDO PEDRO DA SILVA" },
    { code: "61727", name: "CLAUDIO JOAO GORGEN" },
    { code: "61731", name: "JAIRO FARIA VILELA" },
    { code: "61743", name: "CLOVIS JOSE FREESE" },
    { code: "61744", name: "ENALDO RESENDE LUCIANO" },
    { code: "61747", name: "VALERIA DE OLIVEIRA CARVALHO" },
    { code: "61750", name: "ENES MARIA ALMEIDA SANTOS" },
    { code: "61756", name: "SEBASTIAO CHAVES DE CARVALHO" },
    { code: "61771", name: "RICARDO ASSIS PERES" },
    { code: "61772", name: "ADEVALDO LEMES TEODORO" },
    { code: "61773", name: "CLAUDIA HELENA DA ROCHA" },
    { code: "61776", name: "SEVERINO REZENDE OLIVEIRA" },
    { code: "61778", name: "REMY MATOS JUNIOR" },
    { code: "61790", name: "ALVARO CARVALHO FREITAS" },
    { code: "61804", name: "ADEMAR HONORIO DE OLIVEIRA" },
    { code: "61810", name: "EDUARDO OLIVEIRA DE RESENDE" },
    { code: "61811", name: "RUITER RESENDE MACHADO" },
    { code: "61812", name: "CYNTIA DE CARVALHO MORAES" },
    { code: "61813", name: "CARLOS ANTONIO MARTINS" },
    { code: "61820", name: "RENATA ALVES PEREIRA RIBEIRO" },
    { code: "61832", name: "ROGERIO ANTONIO TONIAZZO" },
    { code: "61833", name: "JOAO CARLOS GRAVE" },
    { code: "61834", name: "ROGERIO SILVA CARVALHO" },
    { code: "61836", name: "ANA MARIA VILELA CRUVINEL" },
    { code: "61838", name: "RENATO BURGEL" },
    { code: "61843", name: "ANTONIO GERALDO FERNANDES" },
    { code: "61846", name: "ANTONIO CARLOS GOMES DE CARVALHO" },
    { code: "61847", name: "JACSON MARLON NIEDERMEIER" },
    { code: "61858", name: "AROLDO CASARIN" },
    { code: "61863", name: "MAGNO ROBERTO DE REZENDE" },
    { code: "61868", name: "JURANDIR VILELA JUNIOR" },
    { code: "61869", name: "DIVINA ALVES CRUVINEL" },
    { code: "61870", name: "EDUARDO ANTONIO AMORIM VILELA" },
    { code: "61873", name: "MARCELO EVARISTO VILELA" },
    { code: "61877", name: "JOSE ALTAIR TONSIS" },
    { code: "61880", name: "MARCOS ANTONIO DEWES" },
    { code: "61884", name: "MARIA GORETTI ALMEIDA RESENDE" },
    { code: "61887", name: "MARCOS RIBEIRO DE CARVALHO" },
    { code: "61888", name: "MARCO ANTONIO DE REZENDE" },
    { code: "61890", name: "NILVA MARIA BESSOLI BASSO" },
    { code: "61892", name: "ANDRE CARLOS ADAMS" },
    { code: "61893", name: "AIRTON ANTONIO KATZER" },
    { code: "61899", name: "AIRTON DALLAGO E OUTROS" },
    { code: "61901", name: "ALCINDO MENKE" },
    { code: "61903", name: "NILTON MARCIO DE OLIVEIRA" },
    { code: "61905", name: "LUIZ ANDRO DE OLIVEIRA" },
    { code: "61908", name: "LUCIO ALVES CARVALHO" },
    { code: "61915", name: "KENIO BORGES VASCONCELOS" },
    { code: "61917", name: "CELSO LUIS PREVIATTI" },
    { code: "61918", name: "ANDREA SUBTIL ALMEIDA" },
    { code: "61922", name: "SERGIO ALBERTO STEINMETZ" },
    { code: "61926", name: "SANDRO CUNHA DO PRADO" },
    { code: "61928", name: "GILVAN CARRIJO VILELA" },
    { code: "61933", name: "MARCELO DINIZ RIBEIRO" },
    { code: "61938", name: "LEONARDO SUBTIL MARTINS ALMEIDA E OUTROS" },
    { code: "61946", name: "AELTON SOUSA RESENDE" },
    { code: "61947", name: "ANA MARIA OLIVEIRA PEREIRA" },
    { code: "61951", name: "CLAUDEMIR MIRANDA" },
    { code: "61952", name: "RENATO ALMEIDA DE CARVALHO" },
    { code: "61973", name: "DILMA RESENDE SOUZA SILVA" },
    { code: "61979", name: "WAMILTON RESENDE SOUZA" },
    { code: "61980", name: "FERNANDO BARBOSA TEIXEIRA" },
    { code: "61982", name: "ROKSANA VILELA REZENDE GRAVE" },
    { code: "61989", name: "GILHERME AUGUSTO IRGANG" },
    { code: "61992", name: "ADALBERTO RODRIGUES NETO" },
    { code: "61994", name: "SAULO CRISTIANO PERTILE" },
    { code: "61996", name: "HYGINO PIACENTINI JUNIOR" },
    { code: "62000", name: "DAIRO SOUZA SILVA" },
    { code: "62001", name: "ESPOLIO JOSE DE LAURENTIZ NETO" },
    { code: "62029", name: "PETRO LOGINVCH NIKIFOROFF" },
    { code: "62030", name: "ALOIR VICENTE DA SILVA" },
    { code: "62031", name: "JANAINA JACOBY" },
    { code: "62036", name: "JAIR ANTONIO REIDEL" },
    { code: "62037", name: "VANILDO JOAO PEDRINI" },
    { code: "62046", name: "CESAR FELINI" },
    { code: "62053", name: "VITOR LUIZ DE OLIVEIRA" },
    { code: "62060", name: "GABRIEL MICHELS VILELA" },
    { code: "62065", name: "IVAN ILIZARAVICH IVANOFF" },
    { code: "62106", name: "SAVERIO ARRUDA TRAMONTE" },
    { code: "62110", name: "ANTONIO CARLOS DA SILVA" },
    { code: "62112", name: "BRUNO SERGIO ZANUZZI" },
    { code: "62121", name: "ALEX SOUZA ARAUJO" },
    { code: "62124", name: "VALTER RESENDE SILVA" },
    { code: "62125", name: "JOAQUIM ANGELO CRUVINEL FURQUIM" },
    { code: "62135", name: "MARCIO FERNANDO CALEGARI" },
    { code: "62136", name: "ELIMAR BARBOSA TEIXEIRA" },
    { code: "62142", name: "VANDERCI DUNDI" },
    { code: "62145", name: "TEREZA JUDITE SEGATTO FANTINI E OUTROS" },
    { code: "62153", name: "ANTONIO DA SILVA LAURO" },
    { code: "62166", name: "AURELIANO VILELA CRUVINEL" },
    { code: "62167", name: "LEANDRO PERES CRUVINEL" },
    { code: "62168", name: "JACIOLY VILELA REZENDE" },
    { code: "62174", name: "DALCIO GILBERTO GUARESCHI" },
    { code: "62177", name: "PATRICIA KOMPIER" },
    { code: "62182", name: "LUCIANA DE CARVALHO" },
    { code: "62183", name: "RAMIRO RODRIGUES DUARTE" },
    { code: "62185", name: "GUSTAVO CARDOSO ROCHA" },
    { code: "62187", name: "JULIO CESAR BREANCINI" },
    { code: "62188", name: "SANDRA AIMI" },
    { code: "62189", name: "JOEL RAGAGNIN" },
    { code: "62192", name: "MAURI GUARESCHI" },
    { code: "62193", name: "DILCE TEREZA FLUMIAN BRAGA E OUTROS" },
    { code: "62194", name: "EMILIO ALEXANDRE MONTEIRO" },
    { code: "62201", name: "WESLEY VILELA RESENDE" },
    { code: "62205", name: "JOSE RICARDO DE OLIVEIRA" },
    { code: "62209", name: "PAULO PEREIRA DA CONCEICAO SILVA" },
    { code: "62210", name: "DIEGO KREUZ" },
    { code: "62212", name: "MARCOS APARECIDO CHAGAS" },
    { code: "62215", name: "OMIXON CARVALHO REZENDE" },
    { code: "62218", name: "ALAN RESENDE SOUSA" },
    { code: "62231", name: "AVANILDA SANTEIRO TEODORO SOUSA" },
    { code: "62232", name: "DJONE FRIES" },
    { code: "62235", name: "SIVANILDO FERREIRA RODRIGUES" },
    { code: "62238", name: "FERDINANDO RESENDE LUCIANO" },
    { code: "62239", name: "KASSIO VIEIRA DE CARVALHO" },
    { code: "62244", name: "ANA MARIA SOUZA CARVALHO RESENDE" },
    { code: "62248", name: "PEIXOTO HENRIQUE ALVES" },
    { code: "62250", name: "LENDSON REZENDE CRUVINEL" },
    { code: "62253", name: "ANTONIO DE PADUA CARVALHO" },
    { code: "62262", name: "ARGEMIRO RODRIGUES SANTOS NETO" },
    { code: "62264", name: "LUDMYLLA FREITAS CARVALHO LEAO" },
    { code: "62274", name: "RANIERI BARBOSA CARNEIRO" },
    { code: "62282", name: "SUELY MARIA MARQUES DE CARVALHO" },
    { code: "62285", name: "IVAN CRUVINEL PEREIRA" },
    { code: "62290", name: "CLARISSA CARVALHO VILELA CAMILO" },
    { code: "62292", name: "ROGERIO CUNHA DO PRADO" },
    { code: "62293", name: "EDMUNDO ROCHA VILELA" },
    { code: "62305", name: "JEAN LUIZ REZENDE SOUZA" },
    { code: "62308", name: "ANDRE LUIZ RIBEIRO" },
    { code: "62311", name: "JARDEL JACOBY" },
    { code: "62312", name: "JOSE ALICIO BATISTA CARRIJO" },
    { code: "62319", name: "CASSIO TEODORO CARRIJO" },
    { code: "62320", name: "DANIEL SOUZA VILELA" },
    { code: "62327", name: "ELISON VILELA CRUVINEL" },
    { code: "62328", name: "ESDAILE CARVALHO DOS SANTOS" },
    { code: "62330", name: "ALBERIONE SOUSA RESENDE" },
    { code: "62331", name: "MARCOS OLIVEIRA RESENDE" },
    { code: "62336", name: "RODRIGO CARVALHO CAMILO" },
    { code: "62338", name: "CASSIO DA COSTA CARVALHO" },
    { code: "62343", name: "INERCILIA QUEIROZ DE OLIVEIRA CARREIRA" },
    { code: "62344", name: "MARCIA ANTONIA VERGINASSI" },
    { code: "62346", name: "GILBERTO JUSTINO DE SOUSA" },
    { code: "62347", name: "FABIO CARVALHO REZENDE" },
    { code: "62359", name: "THALES CRISTIANO PELIZON" },
    { code: "62361", name: "ROBERIO MARCOS DA SILVA RAINHA" },
    { code: "62365", name: "LISSAUER VIEIRA" },
    { code: "62370", name: "ADILSON FURTADO DE BARROS JUNIOR" },
    { code: "62371", name: "ELISANGELA BALZ" },
    { code: "62374", name: "EDUARDO SANDRI" },
    { code: "62377", name: "OTO ANTONIO RIBEIRO DE CARVALHO JUNIOR" },
    { code: "62384", name: "LEOMAR ANTONIO DARUI" },
    { code: "62387", name: "ANTONIO ASCENDINO CARVALHO SANTOS" },
    { code: "62389", name: "RICARDO GONCALVES FERREIRA" },
    { code: "62395", name: "DANILO CARVALHO CARDOSO" },
    { code: "62399", name: "JAIME PEREIRA DA CONCEICAO SILVA E OUTROS" },
    { code: "62402", name: "AURELIO GUERRA LIMA FILHO" },
    { code: "62404", name: "NESSEIR SILVA SOUZA" },
    { code: "62408", name: "JOAO BENEDITO MACHADO" },
    { code: "62409", name: "VINICIUS VILELA OLIVEIRA" },
    { code: "62412", name: "LOIS ALEXANDRE PAIVA FREITAS" },
    { code: "62415", name: "RICARDO CRUVINEL MAIA" },
    { code: "62418", name: "FERNANDO RESENDE TEIXEIRA" },
    { code: "62419", name: "LEONIDAS GOMES DE CARVALHO" },
    { code: "62420", name: "MARCELO VILELA CRUVINEL" },
    { code: "62423", name: "AURELIANO SANTOS RESENDE" },
    { code: "62433", name: "VERA ALICE REBELATTO MUNIZ" },
    { code: "62434", name: "ROSSANO NICOLODI" },
    { code: "62436", name: "GUSTAVO HENRIQUE BERNARDES CRUVINEL" },
    { code: "62445", name: "ALESSANDER JOSE BRIGNONI" },
    { code: "62457", name: "MARIA GERTRUDES FRIES" },
    { code: "62460", name: "ADILSON FERNANDO BONMANN" },
    { code: "62462", name: "PABLO GUARESCHI" },
    { code: "62471", name: "RENATO SOUSA MARQUES" },
    { code: "62472", name: "SILVESTRE DA COSTA LIMA NETO" },
    { code: "62474", name: "ENAIRO CARRIJO RESENDE" },
    { code: "62477", name: "SANDRO BRANDAO CARVALHO" },
    { code: "62479", name: "LEONARDO PASSINATO" },
    { code: "62493", name: "DIOGO FRIES" },
    { code: "62496", name: "STEFANO PASSINATO" },
    { code: "62499", name: "MARCUS HENRIQUE FERREIRA NAVES" },
    { code: "62501", name: "HERNANI DE ALMEIDA CARVALHO" },
    { code: "62505", name: "ELZA MARIA SOUSA RESENDE" },
    { code: "62506", name: "LUIZ RENATO ZAPPAROLI" },
    { code: "62509", name: "SANTIEL ALVES VIEIRA NETO" },
    { code: "62512", name: "PAULO KOMPIER" },
    { code: "62513", name: "FERNANDO MORAIS DE ASSIS" },
    { code: "62515", name: "DAIQUISON CARRIJO FERREIRA" },
    { code: "62529", name: "JOSE OSCAR DURIGAN" },
    { code: "62533", name: "RIMER CARVALHO DE RESENDE" },
    { code: "62534", name: "SERGIO ARAUJO MAIA" },
    { code: "62541", name: "GUSTAVO CARVALHO DE CASTRO" },
    { code: "62542", name: "RICARDO DUARTE PRADO" },
    { code: "62543", name: "JOSE MARIA VILELA NETO" },
    { code: "62554", name: "WALTER LUIZ HELENA" },
    { code: "62560", name: "JULIANO DE OLIVEIRA" },
    { code: "62564", name: "EDER CARVALHO REZENDE" },
    { code: "62573", name: "RODRIGO RESENDE SABINO DE CASTRO" },
    { code: "62575", name: "VITOR TEODORO BARBOSA" },
    { code: "62578", name: "RODRIGO DE OLIVEIRA GOULART" },
    { code: "62582", name: "SIMION IVANOFF" },
    { code: "62590", name: "DANILO SILVA OLIVEIRA" },
    { code: "62591", name: "FERNANDO PASSINATTO" },
    { code: "62600", name: "EUDES RIBEIRO BORGES DA SILVA" },
    { code: "62617", name: "LUAN FREITAS ALMEIDA MEES" },
    { code: "62618", name: "KARLEANDRO LEITAO SANTOS" },
    { code: "62647", name: "JOSE CARLOS BIESDORF" },
    { code: "62648", name: "VRENTAL LOCACAO DE MAQUINAS E EQUIPAMENTOS S/A" },
    { code: "62665", name: "PERICLES MORAES PEREIRA" },
    { code: "62667", name: "DONASSOLO COLHEITAS LTDA" },
    { code: "62672", name: "AGNALDO FERNANDES FILHO" },
    { code: "62674", name: "VALTER JOSE LANGER HAAS" },
    { code: "62682", name: "FACCHINI SA" },
    { code: "62683", name: "SF AGRICOLA LTDA" },
    { code: "62686", name: "GABRIEL HENRIQUE PEREIRA DE ARAUJO" },
    { code: "62688", name: "HORACIO ALVARENGA MOREIRA" },
    { code: "62691", name: "ALBERTO PLEFFHEN NETO" },
    { code: "62706", name: "AILTON JOSE VILELA" },
    { code: "62713", name: "VERA LUCIA DA SILVA RODRIGUES" },
    { code: "62714", name: "ALEX ROBERTO DOS SANTOS ARRUDA" },
    { code: "62715", name: "LUIZ STEFANELLO" },
    { code: "62716", name: "FAZENDA PRECIOSA EMPREENDIMENTOS AGRICOLAS LTDA" },
    { code: "62720", name: "RICARDO WITTER" },
    { code: "62756", name: "SERGIO LUIS CARVALHO LUCIANO" },
    { code: "62762", name: "VIGGO GABRIEL COSTA DA SILVA" },
    { code: "62763", name: "ILARIO JOSE SACHERTT" },
    { code: "62775", name: "ALEXANDRE BUENO DA SILVA FONSECA" },
    { code: "62778", name: "FAZENDA PERDIZES EMPREENDIMENTOS AGRICOLAS LTDA" },
    { code: "62794", name: "LUIZ FERNANDO PAULA DE QUEIROZ" },
    { code: "62798", name: "LUIZ AUGUSTO BRUCCELI" },
    { code: "62800", name: "VALTER SOUZA DE QUEIROZ" },
    { code: "62808", name: "BEATRICE CARLOTTA SILVANA CORTI DI RETORBIDO BURI" },
    { code: "62817", name: "RAFAEL TELLES TENORIO DE SIQUEIRA" },
    { code: "62818", name: "MARCELO HENRIQUE PIZZI" },
    { code: "62821", name: "DIONATA CRISTIANO GUARDA" },
    { code: "62843", name: "JOAO LUIZ SERESUELA" },
    { code: "62854", name: "NELINO MANOEL TOLEDO" },
    { code: "62868", name: "WALDEMAR DE FREITAS PEDROSA JUNIOR" },
    { code: "62871", name: "BRUNO MELGACO VAZ E OUTROS" },
    { code: "62879", name: "AGROWPEC COMERCIO E SERVICOS DE PRODUTOS AGROPECUARIOS LTDA" },
    { code: "62897", name: "ARIANA CARVALHO VILELA" },
    { code: "62898", name: "COOP AGROP INTEGR DOS PRODUTORES FAMILIARES DO ASS ASES ARAG" },
    { code: "62913", name: "JOVANI MINUZI" },
    { code: "62914", name: "ARF SILAGENS E TRANSPORTES LTDA" },
    { code: "62921", name: "CARLOS ALBERTO DE SOUZA JARDIM" },
    { code: "62924", name: "KAMYLLA FONSECA DE SOUSA PANSERA" },
    { code: "62929", name: "CLEITONY FARIA TEIXEIRA" },
    { code: "62941", name: "FRANCIS SANINI WEBER" },
    { code: "62954", name: "ELVARO SILVA DE MORAIS E OUTRA" },
    { code: "62956", name: "EDUARDO VIRGILIO CORREA SOARES" },
    { code: "62983", name: "NOELSON VILELA" },
    { code: "62994", name: "JOSE EDUARDO MUFFATO E OUTROS" },
    { code: "63039", name: "DERSO PORTILHO VIEIRA" },
    { code: "63041", name: "JAIR VERONEZZI" },
    { code: "63043", name: "JOABE FERREIRA SILVA" },
    { code: "63055", name: "CELESTINO CARLIN" },
    { code: "63063", name: "ISABEL OLIVA BENEDETTI DE FREITAS ALAVARSE" },
    { code: "63066", name: "JAQUELINE SEHN" },
    { code: "63073", name: "JULIO WEIDDER RODRIGUES" },
    { code: "63089", name: "MARIA APARECIDA OLIVEIRA E SILVA" },
    { code: "63112", name: "RAUBER COLHEITAS LTDA" },
    { code: "63119", name: "GHEDINI SERVICOS AGRICOLAS LTDA" },
    { code: "63128", name: "WAGNER CABRAL SIQUEIRA" },
    { code: "63131", name: "ELZA BARBOSA NAVES" },
    { code: "63133", name: "ALFREDO GUILHERME DORCA" },
    { code: "63137", name: "KAMPAG COLHEITAS LTDA" },
    { code: "63141", name: "ANTONIO APARECIDO CAVAGLIERI E OUTROS" },
    { code: "63152", name: "NILSON MENESES DA SILVA" },
    { code: "63173", name: "LORIANA BORGES PORTILHO" },
    { code: "63186", name: "MOACIR KOHL FILHO" },
    { code: "63187", name: "TALES HENRIQUE ATAIDES DE SOUZA" },
    { code: "63223", name: "CAROLINE BEATRIZ CAMPOS DE SOUZA" },
    { code: "63228", name: "IZAC SANTOS SILVA" },
    { code: "63248", name: "ROMEU ANDRADE PEQUENO VILELA ALVES" },
    { code: "63277", name: "RENATO MENEZES GOMES" },
    { code: "63318", name: "MARCIA VIEIRA DE MORAIS E OUTRAS" },
    { code: "63321", name: "RP BIANCHINI AGROPECUARIA LTDA" },
    { code: "63339", name: "PEDRO DE LACERDA GORGEN" },
    { code: "63352", name: "MARINALDO APARECIDO SOUZA" },
    { code: "63353", name: "BRAZ CUSTODIO PERES NETO E OUTRA" },
    { code: "63361", name: "PEDRO AGUILERA JUNIOR" },
    { code: "63371", name: "BR AGRO AGRONEGOCIOS S.A" }
  ];
  
  const {
    profile
  } = useProfile();

  // Mapear tipos da URL para tipos internos
  const getTaskCategoryFromUrl = (urlType: string | null): 'field-visit' | 'call' | 'workshop-checklist' => {
    switch (urlType) {
      case 'farm_visit':
        return 'field-visit';
      case 'client_call':
        return 'call';
      case 'workshop_checklist':
        return 'workshop-checklist';
      default:
        return 'field-visit';
    }
  };

  // Estado para controlar o tipo de tarefa selecionado
  const [selectedTaskType, setSelectedTaskType] = useState<'field-visit' | 'call' | 'workshop-checklist' | null>(null);
  // Inicializar com URL ou prop se existir
  useEffect(() => {
    if (propTaskType) {
      setSelectedTaskType(propTaskType);
      setTaskCategory(propTaskType);
    } else if (urlTaskType) {
      const initialType = getTaskCategoryFromUrl(urlTaskType);
      setSelectedTaskType(initialType);
      setTaskCategory(initialType);
    }
  }, [urlTaskType, propTaskType]);

  // Função para alterar o tipo de tarefa
  const handleTaskTypeChange = (newType: 'field-visit' | 'call' | 'workshop-checklist') => {
    setSelectedTaskType(newType);
    setTaskCategory(newType);

    // Atualizar o taskType no estado da tarefa
    setTask(prev => ({
      ...prev,
      taskType: getTaskTypeFromCategory(newType)
    }));
  };

  // Função para obter o título da tarefa
  const getTaskTitle = (category: 'field-visit' | 'call' | 'workshop-checklist'): string => {
    switch (category) {
      case 'field-visit':
        return 'Visita a Fazenda';
      case 'call':
        return 'Ligação para Cliente';
      case 'workshop-checklist':
        return 'Checklist da Oficina';
      default:
        return 'Nova Tarefa';
    }
  };
  const [taskCategory, setTaskCategory] = useState<'field-visit' | 'call' | 'workshop-checklist'>(selectedTaskType);
  const [whatsappWebhook, setWhatsappWebhook] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    isOnline,
    saveTaskOffline,
    addToSyncQueue
  } = useOffline();
  const {
    createTask
  } = useTasks();
  // Mapear taskCategory para taskType
  const getTaskTypeFromCategory = (category: 'field-visit' | 'call' | 'workshop-checklist'): 'prospection' | 'ligacao' | 'checklist' => {
    switch (category) {
      case 'field-visit':
        return 'prospection';
      case 'call':
        return 'ligacao';
      case 'workshop-checklist':
        return 'checklist';
      default:
        return 'prospection';
    }
  };
  const [task, setTask] = useState<Partial<Task>>({
    name: '',
    responsible: '',
    client: '',
    clientCode: '',
    property: '',
    filial: '',
    cpf: '',
    email: '',
    taskType: getTaskTypeFromCategory(getTaskCategoryFromUrl(urlTaskType)),
    priority: 'medium',
    observations: '',
    startDate: new Date(),
    endDate: new Date(),
    startTime: '09:00',
    endTime: '17:00',
    initialKm: 0,
    finalKm: 0,
    checklist: [],
    reminders: [],
    photos: [],
    documents: [],
    isProspect: true,
    salesConfirmed: undefined
  });

  // Definir filial automaticamente quando o perfil carregar
  useEffect(() => {
    if (profile) {
      setTask(prev => ({
        ...prev,
        filial: profile.filial_id || ''
      }));
    }
  }, [profile]);

  // Inicializar lista de equipamentos vazia
  const initializeEquipmentList = () => {
    return [];
  };
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [equipmentList, setEquipmentList] = useState<{
    id: string;
    familyProduct: string;
    quantity: number;
  }[]>(initializeEquipmentList());
  const [newReminder, setNewReminder] = useState({
    title: '',
    description: '',
    date: new Date(),
    time: '09:00'
  });

  // Estado para controlar campos condicionais das perguntas da ligação
  const [callQuestions, setCallQuestions] = useState({
    lubricants: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    tires: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    filters: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    batteries: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    parts: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    silobag: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    disk: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    }
  });

  // Estado para o checklist (deve ser declarado antes das funções que o usam)
  const [checklist, setChecklist] = useState<ProductType[]>([]);
  const [callProducts, setCallProducts] = useState<ProductType[]>([]);

  // Função para calcular valor total automático
  const calculateTotalSalesValue = () => {
    let total = 0;

    // Somar valores dos produtos selecionados (visita a campo e workshop)
    if (taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') {
      total += checklist.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }

    // Somar valores das perguntas da ligação
    if (taskCategory === 'call') {
      total += Object.values(callQuestions).reduce((sum, item) => {
        return sum + (item.needsProduct ? item.totalValue : 0);
      }, 0);
    }
    return total;
  };

  // Atualizar valor total automaticamente quando checklist muda (apenas se não há venda parcial ativa)
  useEffect(() => {
    // Só atualizar automaticamente se não há prospectItems (venda parcial) ativas
    if (!task.prospectItems || task.prospectItems.length === 0) {
      const totalValue = calculateTotalSalesValue();
      setTask(prev => ({
        ...prev,
        salesValue: totalValue
      }));
    }
  }, [checklist, callQuestions, taskCategory, task.prospectItems]);

  // REMOVER este useEffect que estava alterando o valor quando prospectItems mudava
  // useEffect(() => {
  //   if (task.prospectItems && task.prospectItems.length > 0) {
  //     const partialValue = task.prospectItems.reduce((sum, item) => {
  //       return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
  //     }, 0);
  //     
  //     console.log('DEBUG: Calculando valor parcial:', partialValue, 'para produtos:', task.prospectItems);
  //     
  //     setTask(prev => ({
  //       ...prev,
  //       salesValue: partialValue
  //     }));
  //   }
  // }, [task.prospectItems]);

  // Função para atualizar perguntas da ligação
  const updateCallQuestion = (product: keyof typeof callQuestions, field: 'needsProduct' | 'quantity' | 'unitValue', value: boolean | number) => {
    setCallQuestions(prev => {
      const updated = {
        ...prev,
        [product]: {
          ...prev[product],
          [field]: value
        }
      };

      // Calcular valor total do produto específico
      const productData = updated[product];
      const totalValue = productData.quantity * productData.unitValue;
      updated[product] = {
        ...productData,
        totalValue: totalValue
      };
      return updated;
    });
  };
  const fieldVisitProducts: ProductType[] = [{
    id: '1',
    name: 'Pneus',
    category: 'tires',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '2',
    name: 'Lubrificantes',
    category: 'lubricants',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '3',
    name: 'Óleos',
    category: 'oils',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '4',
    name: 'Graxas',
    category: 'greases',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '5',
    name: 'Baterias',
    category: 'batteries',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '7',
    name: 'Silo Bolsa',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '8',
    name: 'Cool Gard',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '9',
    name: 'Disco',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }];
  const workshopChecklistItems: ProductType[] = [{
    id: '1',
    name: 'Verificação de Óleo do Motor',
    category: 'oils',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '2',
    name: 'Inspeção de Freios',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '3',
    name: 'Verificação de Pneus',
    category: 'tires',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '4',
    name: 'Teste de Bateria',
    category: 'batteries',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '5',
    name: 'Verificação de Luzes',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '6',
    name: 'Inspeção de Suspensão',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '7',
    name: 'Verificação de Líquidos',
    category: 'oils',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '8',
    name: 'Diagnóstico Eletrônico',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '9',
    name: 'Limpeza Geral',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }];
  const getProductsForCategory = () => {
    switch (taskCategory) {
      case 'field-visit':
        return fieldVisitProducts;
      case 'workshop-checklist':
        return workshopChecklistItems;
      default:
        return [];
    }
  };
  // Inicializar checklist com produtos baseados na categoria
  useEffect(() => {
    setChecklist(getProductsForCategory());
    setCallProducts(fieldVisitProducts);
  }, [taskCategory]);

  // Função para buscar informações anteriores pelo CPF
  const searchPreviousDataByCPF = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;
    try {
      // Buscar no Supabase
      const {
        data: tasks
      } = await supabase.from('tasks').select('*').ilike('observations', `%${cpf}%`).order('created_at', {
        ascending: false
      }).limit(1);
      if (tasks && tasks.length > 0) {
        const lastTask = tasks[0];

        // Extrair hectares das observações se existir
        let hectares = '';
        if (lastTask.observations) {
          const hectaresMatch = lastTask.observations.match(/hectares?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
          if (hectaresMatch) {
            hectares = hectaresMatch[1];
          }
        }
        setTask(prev => ({
          ...prev,
          client: lastTask.client || '',
          responsible: profile?.name || lastTask.responsible || '',
          property: lastTask.property || '',
          observations: hectares ? `Hectares: ${hectares}` : ''
        }));
        toast({
          title: "📋 Dados encontrados",
          description: "Informações do CPF foram preenchidas automaticamente"
        });
      } else {
        // Buscar no localStorage como fallback
        const savedData = localStorage.getItem(`cpf_data_${cpf}`);
        if (savedData) {
          const data = JSON.parse(savedData);
          setTask(prev => ({
            ...prev,
            client: data.client || '',
            responsible: profile?.name || data.responsible || '',
            property: data.property || '',
            observations: data.hectares ? `Hectares: ${data.hectares}` : ''
          }));
          toast({
            title: "📋 Dados encontrados",
            description: "Informações do CPF foram preenchidas automaticamente"
          });
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados anteriores:', error);
    }
  };

  // Função para salvar dados do CPF no localStorage
  const saveCPFData = (cpf: string, data: {
    client: string;
    responsible: string;
    property: string;
    hectares?: string;
  }) => {
    if (cpf && (data.client || data.responsible || data.property || data.hectares)) {
      localStorage.setItem(`cpf_data_${cpf}`, JSON.stringify(data));
    }
  };

  // Função para resetar todos os campos do formulário
  const resetAllFields = () => {
    // Reset task state (mantém apenas filial)
    setTask({
      name: '',
      responsible: profile?.name || '',
      client: '',
      property: '',
      filial: profile?.filial_id || '',
      cpf: '',
      email: '',
      taskType: getTaskTypeFromCategory(taskCategory),
      priority: 'medium',
      observations: '',
      startDate: new Date(),
      endDate: new Date(),
      startTime: '09:00',
      endTime: '17:00',
      initialKm: 0,
      finalKm: 0,
      checklist: [],
      reminders: [],
      photos: [],
      documents: [],
      isProspect: true,
      salesConfirmed: undefined,
      salesValue: 0,
      prospectItems: [],
      prospectNotes: '',
      propertyHectares: 0,
      equipmentQuantity: 0,
      familyProduct: ''
    });

    // Reset call questions
    setCallQuestions({
      lubricants: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      tires: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      filters: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      batteries: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      parts: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      silobag: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      disk: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      }
    });

    // Reset product lists
    setChecklist(getProductsForCategory());
    setCallProducts(fieldVisitProducts);

    // Reset equipment list
    setEquipmentList(initializeEquipmentList());

    // Reset reminders
    setReminders([]);
    setNewReminder({
      title: '',
      description: '',
      date: new Date(),
      time: '09:00'
    });

    // Reset WhatsApp webhook
    setWhatsappWebhook('');
  };

  // Atualiza o checklist e taskType quando o tipo de tarefa muda
  useEffect(() => {
    setChecklist(getProductsForCategory());
    setTask(prev => ({
      ...prev,
      taskType: getTaskTypeFromCategory(taskCategory)
    }));
  }, [taskCategory]);
  const handleChecklistChange = (id: string, checked: boolean) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? {
        ...item,
        selected: checked
      } : item);
      return updated;
    });
  };
  const handleProductChange = (id: string, field: keyof ProductType, value: any) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? {
        ...item,
        [field]: value
      } : item);
      return updated;
    });
  };
  const handleProductPhotoChange = (productId: string, photos: string[]) => {
    setChecklist(prev => prev.map(item => item.id === productId ? {
      ...item,
      photos
    } : item));
  };

  // Função para atualizar produtos do prospectItems (venda parcial)
  const handleProspectItemChange = (index: number, field: 'selected' | 'quantity' | 'price', value: boolean | number) => {
    console.log('DEBUG: Atualizando produto da venda parcial -', field, ':', value, 'para índice:', index);
    const updatedItems = [...(task.prospectItems || [])];
    if (field === 'selected') {
      updatedItems[index] = {
        ...updatedItems[index],
        selected: value as boolean
      };
    } else if (field === 'quantity') {
      updatedItems[index] = {
        ...updatedItems[index],
        quantity: value as number
      };
    } else if (field === 'price') {
      updatedItems[index] = {
        ...updatedItems[index],
        price: value as number
      };
    }
    console.log('DEBUG: Produto atualizado:', updatedItems[index]);
    setTask(prev => ({
      ...prev,
      prospectItems: updatedItems
    }));
  };

  // Funções para gerenciar produtos da ligação
  const handleCallProductChange = (id: string, checked: boolean) => {
    setCallProducts(prev => prev.map(item => item.id === id ? {
      ...item,
      selected: checked
    } : item));
  };
  const handleCallProductUpdate = (id: string, field: keyof ProductType, value: any) => {
    setCallProducts(prev => prev.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };
  const handleCallProductPhotoChange = (productId: string, photos: string[]) => {
    setCallProducts(prev => prev.map(item => item.id === productId ? {
      ...item,
      photos
    } : item));
  };
  const addReminder = () => {
    if (newReminder.title.trim()) {
      const reminder: Reminder = {
        id: Date.now().toString(),
        title: newReminder.title,
        description: newReminder.description,
        date: newReminder.date,
        time: newReminder.time,
        completed: false
      };
      setReminders(prev => [...prev, reminder]);
      setNewReminder({
        title: '',
        description: '',
        date: new Date(),
        time: '09:00'
      });
    }
  };
  const removeReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  // Funções para gerenciar lista de equipamentos
  const addEquipment = () => {
    const newEquipment = {
      id: Date.now().toString(),
      familyProduct: '',
      // Campo vazio para o usuário preencher
      quantity: 0 // Campo vazio para o usuário preencher
    };
    setEquipmentList(prev => [...prev, newEquipment]);
  };
  const updateEquipment = (id: string, field: 'familyProduct' | 'quantity', value: string | number) => {
    setEquipmentList(prev => prev.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };
  const removeEquipment = (id: string) => {
    setEquipmentList(prev => prev.filter(item => item.id !== id));
  };
  const handleCheckIn = (location: {
    lat: number;
    lng: number;
    timestamp: Date;
  }) => {
    setTask(prev => ({
      ...prev,
      checkInLocation: location
    }));
  };
  const sendToWhatsApp = async (taskData: any) => {
    if (!whatsappWebhook) return;
    try {
      const message = `🚀 *Nova Tarefa Criada*

📋 *Nome:* ${taskData.name}
👤 *Responsável:* ${taskData.responsible}
🏢 *Cliente:* ${taskData.client}
📅 *Data:* ${taskData.startDate ? format(taskData.startDate, "PPP", {
        locale: ptBR
      }) : 'Não definida'}
⏰ *Horário:* ${taskData.startTime} - ${taskData.endTime}
🎯 *Prioridade:* ${taskData.priority}

${taskData.observations ? `📝 *Observações:* ${taskData.observations}` : ''}`;
      await fetch(whatsappWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        mode: "no-cors",
        body: JSON.stringify({
          message: message,
          timestamp: new Date().toISOString(),
          taskData: taskData
        })
      });
    } catch (error) {
      console.error("Erro ao enviar para WhatsApp:", error);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validação obrigatória do status da oportunidade
    if (task.salesConfirmed === undefined && !task.isProspect) {
      toast({
        title: "Campo obrigatório",
        description: "Selecione o status da oportunidade (Prospect, Venda Realizada ou Venda Perdida)",
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    // Capturar data e hora atual exatos no momento da criação
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    const taskData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      // Garantir que taskType está correto
      startDate: now,
      // Data atual exata
      endDate: now,
      // Data atual exata
      startTime: currentTime,
      // Horário atual exato
      endTime: currentTime,
      // Horário atual exato
      checklist: taskCategory === 'call' ? callProducts.filter(item => item.selected) : checklist.filter(item => item.selected),
      reminders,
      equipmentList
    };
    try {
      // Gerar ID único para a tarefa
      const taskId = Date.now().toString();
      const finalTaskData = {
        ...taskData,
        id: taskId,
        createdAt: now,
        updatedAt: now,
        status: 'pending' as const,
        createdBy: taskData.responsible || 'Usuário'
      };
      if (isOnline) {
        // Modo online - salvar no Supabase
        console.log('Salvando online:', finalTaskData);
        const savedTask = await createTask(finalTaskData);
        if (!savedTask) {
          throw new Error('Falha ao salvar no banco de dados');
        }

        // Enviar para WhatsApp se webhook configurado
        if (whatsappWebhook) {
          await sendToWhatsApp(finalTaskData);
        }
      } else {
        // Modo offline - salvar localmente
        console.log('Salvando offline:', finalTaskData);
        saveTaskOffline(finalTaskData);

        // Adicionar WhatsApp à fila de sincronização se configurado
        if (whatsappWebhook) {
          addToSyncQueue({
            type: 'whatsapp',
            webhook: whatsappWebhook,
            taskData: finalTaskData
          });
        }
      }

      // Reset completo do formulário e voltar à seleção de tipo de tarefa
      resetAllFields();
      
      // Reset do tipo de tarefa selecionado para voltar à tela inicial
      setSelectedTaskType(null);
      setTaskCategory('field-visit');
      
      // Scroll para o topo da página
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      toast({
        title: "✅ Tarefa Criada com Sucesso!",
        description: isOnline 
          ? "Tarefa salva no servidor. Você pode criar uma nova tarefa." 
          : "Tarefa salva offline - será sincronizada quando conectar. Você pode criar uma nova tarefa."
      });
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a tarefa",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSaveDraft = () => {
    const draftData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      checklist: taskCategory === 'call' ? callProducts.filter(item => item.selected) : checklist.filter(item => item.selected),
      reminders,
      equipmentList,
      isDraft: true
    };

    // Salvar dados do CPF para reutilização futura
    if (task.cpf) {
      // Extrair hectares das observações se existir
      let hectares = '';
      if (task.observations) {
        const hectaresMatch = task.observations.match(/hectares?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (hectaresMatch) {
          hectares = hectaresMatch[1];
        }
      }
      saveCPFData(task.cpf.replace(/\D/g, ''), {
        client: task.client || '',
        responsible: task.responsible || '',
        property: task.property || '',
        hectares: hectares || ''
      });
    }

    // Salvar no localStorage como rascunho
    const existingDrafts = JSON.parse(localStorage.getItem('task_drafts') || '[]');
    const draftId = `draft_${Date.now()}`;
    const newDraft = {
      id: draftId,
      ...draftData,
      savedAt: new Date(),
      category: taskCategory
    };
    existingDrafts.push(newDraft);
    localStorage.setItem('task_drafts', JSON.stringify(existingDrafts));
    toast({
      title: "💾 Rascunho Salvo",
      description: "Suas alterações foram salvas como rascunho!"
    });
  };

  // Componente para renderizar campos de valor unitário e total
  const renderValueFields = (product: keyof typeof callQuestions) => {
    const productData = callQuestions[product];
    return <div className="ml-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" placeholder="Digite a quantidade" value={productData.quantity || ''} onChange={e => updateCallQuestion(product, 'quantity', parseInt(e.target.value) || 0)} min="0" step="1" />
          </div>
          <div className="space-y-2">
            <Label>Valor Unitário (R$)</Label>
            <div className="relative">
              <Input type="text" placeholder="0,00" className="pl-8" value={productData.unitValue ? new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(productData.unitValue) : ''} onChange={e => {
              const value = e.target.value.replace(/\D/g, '');
              const numericValue = parseFloat(value) / 100;
              updateCallQuestion(product, 'unitValue', isNaN(numericValue) ? 0 : numericValue);
            }} />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor Total (R$)</Label>
            <div className="relative">
              <Input type="text" className="pl-8 bg-muted cursor-not-allowed" value={productData.totalValue ? new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(productData.totalValue) : '0,00'} readOnly />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
        </div>
      </div>;
  };
  return <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div>
        
        
        {/* Seletor de Tipo de Tarefa - só mostra se não há taskType via prop */}
        {!propTaskType && (
          <div className="mt-8 p-6 bg-card/50 border border-border/50 rounded-xl shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Gestão de Vendas de Peças</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Selecione o tipo de tarefa que deseja criar:</p>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Button 
              type="button" 
              variant="outline" 
              className="h-auto p-6 flex-col gap-3 border-success/20 hover:border-success/40 hover:bg-success/5"
              onClick={() => window.location.href = '/create-field-visit'}
            >
              <MapPin className="h-8 w-8 text-success" />
              <div className="text-center">
                <div className="font-semibold">Visita à Fazenda</div>
                <div className="text-sm opacity-80">Prospecção de clientes</div>
              </div>
            </Button>
            
            <Button 
              type="button" 
              variant="outline" 
              className="h-auto p-6 flex-col gap-3 border-primary/20 hover:border-primary/40 hover:bg-primary/5"
              onClick={() => window.location.href = '/create-call'}
            >
              <Phone className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Ligação</div>
                <div className="text-sm opacity-80">Contato telefônico</div>
              </div>
            </Button>
            
            <Button 
              type="button" 
              variant="outline" 
              className="h-auto p-6 flex-col gap-3 border-warning/20 hover:border-warning/40 hover:bg-warning/5"
              onClick={() => window.location.href = '/create-workshop-checklist'}
            >
              <Wrench className="h-8 w-8 text-warning" />
              <div className="text-center">
                <div className="font-semibold">Checklist Oficina</div>
                <div className="text-sm opacity-80">Verificação de produtos</div>
              </div>
            </Button>
          </div>
        </div>
        )}

        {(selectedTaskType || propTaskType) && <>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
              {getTaskTitle(selectedTaskType || propTaskType!)}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base mb-4">
              {(selectedTaskType || propTaskType) === 'field-visit' ? 'Criar uma nova visita à fazenda' : (selectedTaskType || propTaskType) === 'call' ? 'Registrar uma nova ligação para cliente' : 'Criar um novo checklist da oficina'}
            </p>
          </>}
      </div>

        {/* Indicador de Status Offline - apenas quando tipo de tarefa selecionado */}
        {(selectedTaskType || propTaskType) && <OfflineIndicator />}

      {(selectedTaskType || propTaskType) && <form onSubmit={handleSubmit}>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="responsible">Nome do Contato</Label>
                <Input id="responsible" value={task.responsible} onChange={e => setTask(prev => ({
                ...prev,
                responsible: e.target.value
              }))} placeholder="Nome do Contato" />
              </div>

              

              <div className="space-y-2">
                <Label htmlFor="reportDate">Data do Relatório</Label>
                <Input id="reportDate" value={new Date().toLocaleDateString('pt-BR')} readOnly className="bg-muted cursor-not-allowed" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientCode">Código do Cliente</Label>
                <div className="relative">
                  <Input 
                    id="clientCode" 
                    value={task.clientCode || ''} 
                    onChange={e => {
                      const value = e.target.value;
                      setTask(prev => ({
                        ...prev,
                        clientCode: value
                      }));
                      // Filtrar códigos baseado no input
                      if (value) {
                        const filtered = clientCodes.filter(code => 
                          code.code.includes(value) || code.name.toLowerCase().includes(value.toLowerCase())
                        );
                        setFilteredClientCodes(filtered);
                        setShowDropdown(true);
                      } else {
                        setShowDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      if (task.clientCode) {
                        const filtered = clientCodes.filter(code => 
                          code.code.includes(task.clientCode) || code.name.toLowerCase().includes(task.clientCode.toLowerCase())
                        );
                        setFilteredClientCodes(filtered);
                        setShowDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay para permitir clique no dropdown
                      setTimeout(() => setShowDropdown(false), 200);
                    }}
                    placeholder="Digite o código ou nome do cliente" 
                  />
                  {showDropdown && filteredClientCodes.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredClientCodes.map((clientCodeItem) => (
                        <div
                          key={clientCodeItem.code}
                          className="px-3 py-2 cursor-pointer hover:bg-muted flex justify-between items-center"
                          onClick={() => {
                            setTask(prev => ({
                              ...prev,
                              clientCode: clientCodeItem.code,
                              client: clientCodeItem.name
                            }));
                            setShowDropdown(false);
                          }}
                        >
                          <span className="font-medium">{clientCodeItem.code}</span>
                          <span className="text-muted-foreground text-sm">{clientCodeItem.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Nome do Cliente</Label>
                <Input id="client" value={task.client} onChange={e => setTask(prev => ({
                ...prev,
                client: e.target.value
              }))} placeholder="Nome do cliente" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email do Cliente/Contato</Label>
                <Input id="email" type="email" value={task.email || ''} onChange={e => setTask(prev => ({
                ...prev,
                email: e.target.value
              }))} placeholder="email@exemplo.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="property">Nome da Propriedade</Label>
                <Input id="property" value={task.property} onChange={e => setTask(prev => ({
                ...prev,
                property: e.target.value
              }))} placeholder="Nome da propriedade" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Vendedor</Label>
                <Input id="vendor" value={profile?.name || ''} disabled placeholder="Nome do vendedor" className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filial">Filial</Label>
                <Input id="filial" value={profile?.filial_nome || 'Não informado'} disabled placeholder="Filial" className="bg-muted" />
              </div>

              {taskCategory === 'call' && <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" type="tel" placeholder="Telefone do cliente" />
                </div>}
            </CardContent>
          </Card>

          {/* Informações de Equipamentos - para ambos: visita a campo e ligação */}
          {(taskCategory === 'field-visit' || taskCategory === 'call') && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Lista de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Hectares da Propriedade */}
                 <div className="space-y-2">
                   <Label htmlFor="propertyHectares">Hectares da Propriedade *</Label>
                    <Input id="propertyHectares" type="number" min="0" value={task.propertyHectares || ''} onChange={e => setTask(prev => ({
                ...prev,
                propertyHectares: parseInt(e.target.value) || undefined
              }))} placeholder="Digite os hectares da propriedade" required />
                 </div>

                {/* Lista de Equipamentos */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Equipamentos do Cliente</Label>
                    <Button type="button" onClick={addEquipment} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700" size="sm">
                      <Plus className="h-4 w-4" />
                      Adicionar Equipamento
                    </Button>
                  </div>

                  {equipmentList.length === 0 && <div className="text-center text-muted-foreground py-8 border-2 border-dashed border-border rounded-lg">
                      <Building className="h-8 w-8 mx-auto mb-2" />
                      <p>Nenhum equipamento adicionado</p>
                      <p className="text-sm">Clique em "Adicionar Equipamento" para começar</p>
                    </div>}

                  {equipmentList.map((equipment, index) => <Card key={equipment.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">Equipamento {index + 1}</h4>
                            <Button type="button" onClick={() => removeEquipment(equipment.id)} variant="outline" size="sm" className="h-8 w-8 p-0">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Família do Produto</Label>
                              <Select value={equipment.familyProduct} onValueChange={value => updateEquipment(equipment.id, 'familyProduct', value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a família" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="TRATOR">TRATOR</SelectItem>
                                  <SelectItem value="PLATAFORMA">PLATAFORMA</SelectItem>
                                  <SelectItem value="COLHEITADEIRA">COLHEITADEIRA</SelectItem>
                                  <SelectItem value="PLANTADEIRA">PLANTADEIRA</SelectItem>
                                  <SelectItem value="PULVERIZADOR">PULVERIZADOR</SelectItem>
                                  <SelectItem value="COLHEDORA">COLHEDORA</SelectItem>
                                  <SelectItem value="FORRAGEIRA">FORRAGEIRA</SelectItem>
                                  <SelectItem value="OUTROS">OUTROS</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Quantidade</Label>
                              <Input type="number" value={equipment.quantity || ''} onChange={e => updateEquipment(equipment.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="Digite a quantidade" min="0" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CardContent>
            </Card>}

          {/* Produtos / Checklist - apenas para visita a campo e workshop */}
          {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {taskCategory === 'field-visit' ? 'Produtos para Ofertar' : 'Checklist da Oficina'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {checklist.map(item => <Card key={item.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={item.id} checked={item.selected} onCheckedChange={checked => handleChecklistChange(item.id, checked as boolean)} />
                            <Label htmlFor={item.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {item.name}
                            </Label>
                          </div>
                          
                          {item.selected && <div className="ml-6 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`qty-${item.id}`}>QTD</Label>
                                  <Input id={`qty-${item.id}`} type="number" min="0" value={item.quantity || ''} onChange={e => handleProductChange(item.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="" />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`price-${item.id}`}>Valor Unitário</Label>
                                  <div className="relative">
                                    <Input id={`price-${item.id}`} type="text" value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : ''} onChange={e => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              handleProductChange(item.id, 'price', isNaN(numericValue) ? 0 : numericValue);
                            }} placeholder="0,00" className="pl-8" />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Valor Total</Label>
                                  <div className="relative">
                                    <Input type="text" className="pl-8 bg-muted cursor-not-allowed" value={item.selected && item.price && item.quantity ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price * item.quantity) : '0,00'} readOnly />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor={`obs-${item.id}`}>Observações</Label>
                                <Textarea id={`obs-${item.id}`} value={item.observations || ''} onChange={e => handleProductChange(item.id, 'observations', e.target.value)} placeholder="Observações sobre este produto..." className="min-h-[80px]" />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Fotos do Produto</Label>
                                <PhotoUpload photos={item.photos || []} onPhotosChange={photos => handleProductPhotoChange(item.id, photos)} maxPhotos={5} />
                              </div>
                            </div>}
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CardContent>
            </Card>}

          {/* Campos específicos para Ligação */}
          {taskCategory === 'call' && <>
              {/* Perguntas da Ligação */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Perguntas da Ligação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  

                  

                  

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Está precisando de Lubrificantes:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-yes" checked={callQuestions.lubricants.needsProduct} onCheckedChange={checked => updateCallQuestion('lubricants', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="lubricants-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-no" checked={!callQuestions.lubricants.needsProduct} onCheckedChange={checked => updateCallQuestion('lubricants', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="lubricants-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.lubricants.needsProduct && renderValueFields('lubricants')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Pneus:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-yes" checked={callQuestions.tires.needsProduct} onCheckedChange={checked => updateCallQuestion('tires', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="tires-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-no" checked={!callQuestions.tires.needsProduct} onCheckedChange={checked => updateCallQuestion('tires', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="tires-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.tires.needsProduct && renderValueFields('tires')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Filtros:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-yes" checked={callQuestions.filters.needsProduct} onCheckedChange={checked => updateCallQuestion('filters', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="filters-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-no" checked={!callQuestions.filters.needsProduct} onCheckedChange={checked => updateCallQuestion('filters', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="filters-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.filters.needsProduct && renderValueFields('filters')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Baterias:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-yes" checked={callQuestions.batteries.needsProduct} onCheckedChange={checked => updateCallQuestion('batteries', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="batteries-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-no" checked={!callQuestions.batteries.needsProduct} onCheckedChange={checked => updateCallQuestion('batteries', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="batteries-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.batteries.needsProduct && renderValueFields('batteries')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Peças:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-yes" checked={callQuestions.parts.needsProduct} onCheckedChange={checked => updateCallQuestion('parts', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="parts-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-no" checked={!callQuestions.parts.needsProduct} onCheckedChange={checked => updateCallQuestion('parts', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="parts-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.parts.needsProduct && renderValueFields('parts')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Silo Bolsa:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-yes" checked={callQuestions.silobag.needsProduct} onCheckedChange={checked => updateCallQuestion('silobag', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="silobag-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-no" checked={!callQuestions.silobag.needsProduct} onCheckedChange={checked => updateCallQuestion('silobag', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="silobag-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.silobag.needsProduct && renderValueFields('silobag')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Disco:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-yes" checked={callQuestions.disk.needsProduct} onCheckedChange={checked => updateCallQuestion('disk', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="disk-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-no" checked={!callQuestions.disk.needsProduct} onCheckedChange={checked => updateCallQuestion('disk', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="disk-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.disk.needsProduct && renderValueFields('disk')}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceImprovement">O que podemos fazer para melhorar o atendimento de peças junto a Fazenda do senhor?</Label>
                    <Textarea id="serviceImprovement" placeholder="Sugestões para melhorar o atendimento..." className="min-h-[80px]" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Nome:</Label>
                      <Input id="contactName" placeholder="Nome do contato" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="farmRole">Função na Fazenda:</Label>
                      <Input id="farmRole" placeholder="Função/cargo" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="consultant">Consultor:</Label>
                      <Input id="consultant" placeholder="Nome do consultor" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partsManager">Gestor de Peças:</Label>
                      <Input id="partsManager" placeholder="Nome do gestor de peças" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>}
        </div>

        {/* Observações e Valores */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Observações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observations">Observações</Label>
              <Textarea id="observations" value={task.observations} onChange={e => setTask(prev => ({
              ...prev,
              observations: e.target.value
            }))} placeholder="Observações sobre a tarefa..." className="min-h-[80px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesValue">Valor de Venda/Oportunidade (R$)</Label>
                <div className="relative">
                  <Input id="salesValue" type="text" value={calculateTotalSalesValue() ? new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(calculateTotalSalesValue()) : '0,00'} className="pl-8 bg-muted cursor-not-allowed" readOnly />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {taskCategory === 'call' ? "Valor calculado com base nas perguntas da ligação" : "Valor calculado com base nos produtos/serviços selecionados"}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-2xl font-bold text-foreground mb-6 block flex items-center gap-3">
                    <span className="text-3xl">🎯</span>
                    Status da Oportunidade 
                    <span className="text-destructive text-xl">*</span>
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
                    {/* PROSPECT CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.isProspect && task.salesConfirmed === undefined ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/20 to-primary/10 shadow-2xl transform scale-110 ring-4 ring-primary/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-primary hover:from-primary/5 hover:to-primary/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    isProspect: true,
                    salesConfirmed: undefined
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.isProspect && task.salesConfirmed === undefined ? 'bg-primary text-primary-foreground shadow-primary/30 animate-pulse' : 'bg-muted group-hover:bg-primary/20 text-muted-foreground group-hover:text-primary'}`}>
                          <Search className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Prospect</div>
                          <div className="text-sm text-muted-foreground">Cliente em análise</div>
                        </div>
                      </div>
                      {task.isProspect && task.salesConfirmed === undefined && <div className="absolute -top-3 -right-3 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-primary-foreground" />
                        </div>}
                    </div>
                    
                    {/* VENDA REALIZADA CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.salesConfirmed === true ? 'border-success bg-gradient-to-br from-success/10 via-success/20 to-success/10 shadow-2xl transform scale-110 ring-4 ring-success/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-success hover:from-success/5 hover:to-success/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: true,
                    isProspect: true
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.salesConfirmed === true ? 'bg-success text-success-foreground shadow-success/30 animate-pulse' : 'bg-muted group-hover:bg-success/20 text-muted-foreground group-hover:text-success'}`}>
                          <CheckCircle className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Venda Realizada</div>
                          <div className="text-sm text-muted-foreground">Negócio fechado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === true && <div className="absolute -top-3 -right-3 w-12 h-12 bg-success rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-success-foreground" />
                        </div>}
                    </div>
                    
                    {/* VENDA PERDIDA CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.salesConfirmed === false ? 'border-destructive bg-gradient-to-br from-destructive/10 via-destructive/20 to-destructive/10 shadow-2xl transform scale-110 ring-4 ring-destructive/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-destructive hover:from-destructive/5 hover:to-destructive/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: false,
                    isProspect: true
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.salesConfirmed === false ? 'bg-destructive text-destructive-foreground shadow-destructive/30 animate-pulse' : 'bg-muted group-hover:bg-destructive/20 text-muted-foreground group-hover:text-destructive'}`}>
                          <XCircle className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Venda Perdida</div>
                          <div className="text-sm text-muted-foreground">Negócio não realizado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === false && <div className="absolute -top-3 -right-3 w-12 h-12 bg-destructive rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-destructive-foreground" />
                        </div>}
                    </div>
                  </div>
                </div>

                {/* Campo de observação para venda perdida */}
                {task.salesConfirmed === false && task.isProspect && <div className="space-y-2">
                    <Label htmlFor="lossReason">Motivo da Perda</Label>
                    <select id="lossReason" value={task.prospectNotes || ''} onChange={e => setTask(prev => ({
                  ...prev,
                  prospectNotes: e.target.value
                }))} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                      <option value="">Selecione o motivo</option>
                      <option value="Falta de peça">Falta de peça</option>
                      <option value="Preço">Preço</option>
                      <option value="Prazo">Prazo</option>
                    </select>
                  </div>}

                {/* Opções para venda realizada */}
                {task.salesConfirmed === true && <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Tipo de Venda</Label>
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center space-x-2">
                          <input type="radio" id="totalSale" name="saleType" value="total" checked={!task.prospectItems || task.prospectItems.length === 0} onChange={() => {
                        // Calcular valor total automaticamente baseado no tipo de tarefa
                        const totalValue = taskCategory === 'call' ? Object.values(callQuestions).reduce((sum, item) => sum + (item.needsProduct ? item.totalValue : 0), 0) : checklist.reduce((sum, item) => sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0), 0);
                        setTask(prev => ({
                          ...prev,
                          prospectItems: [],
                          salesValue: totalValue > 0 ? totalValue : prev.salesValue
                        }));
                      }} className="h-4 w-4" />
                          <Label htmlFor="totalSale">Valor Total</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                           <input type="radio" id="partialSale" name="saleType" value="partial" checked={task.prospectItems && task.prospectItems.length > 0} onChange={() => {
                        if (taskCategory === 'call') {
                          // Para ligações, usar produtos que precisam de fornecimento
                          const selectedProducts = Object.entries(callQuestions).filter(([key, value]) => value.needsProduct).map(([key, value]) => ({
                            id: key,
                            name: key.charAt(0).toUpperCase() + key.slice(1),
                            category: 'other' as const,
                            selected: true,
                            quantity: value.quantity || 1,
                            price: value.unitValue || 0
                          }));
                          setTask(prev => ({
                            ...prev,
                            prospectItems: selectedProducts
                          }));
                        } else {
                          // Para visitas/checklist, usar produtos selecionados
                          const selectedProducts = checklist.filter(item => item.selected).map(item => ({
                            ...item,
                            selected: true,
                            quantity: item.quantity || 1,
                            price: item.price || 0
                          }));
                          setTask(prev => ({
                            ...prev,
                            prospectItems: selectedProducts
                          }));
                        }
                      }} className="h-4 w-4" />
                           <Label htmlFor="partialSale">Valor Parcial</Label>
                         </div>
                      </div>
                    </div>

                    {/* Campo de valor total editável quando não há produtos selecionados */}
                    {(!task.prospectItems || task.prospectItems.length === 0) && <div className="space-y-2">
                        <Label htmlFor="totalSaleValue">Valor Total da Venda (R$)</Label>
                        <div className="relative">
                          <Input id="totalSaleValue" type="text" value={task.salesValue ? new Intl.NumberFormat('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(task.salesValue) : ''} onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      const numericValue = parseFloat(value) / 100;
                      setTask(prev => ({
                        ...prev,
                        salesValue: isNaN(numericValue) ? undefined : numericValue
                      }));
                    }} placeholder="0,00" className="pl-8" />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {taskCategory === 'call' ? "Valor calculado com base nas perguntas da ligação. Você pode editá-lo se necessário." : checklist.some(item => item.selected) ? "Valor calculado automaticamente com base nos produtos selecionados. Você pode editá-lo se necessário." : "Digite o valor total da venda realizada."}
                        </p>
                      </div>}

                     {/* Campo de valor para venda parcial */}
                     {task.prospectItems && task.prospectItems.length > 0 && <div className="space-y-2">
                         <Label htmlFor="partialSaleValue">Valor da Venda Parcial (R$)</Label>
                         <div className="relative">
                           <Input id="partialSaleValue" type="text" value={task.prospectItems ? task.prospectItems.reduce((sum, item) => {
                      return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                    }, 0) : 0 ? new Intl.NumberFormat('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(task.prospectItems.reduce((sum, item) => {
                      return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                    }, 0)) : '0,00'} className="pl-8 bg-green-50 border-green-200 text-green-800 font-medium" readOnly />
                           <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-green-600">R$</span>
                         </div>
                         <p className="text-xs text-green-600 font-medium">
                           ⚡ Valor calculado automaticamente com base nos produtos selecionados para venda parcial
                         </p>
                       </div>}

                     {/* Lista de produtos para venda parcial */}
                     {task.prospectItems && task.prospectItems.length > 0 && <div className="space-y-3">
                         <Label className="text-sm font-medium">Produtos Vendidos</Label>
                          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                            {task.prospectItems.map((item, index) => <div key={item.id} className="flex items-center justify-between space-x-3 p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <Checkbox checked={item.selected} onCheckedChange={checked => {
                          handleProspectItemChange(index, 'selected', checked as boolean);
                        }} />
                                  <div className="flex-1">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{item.name}</span>
                                      <span className="text-xs text-muted-foreground">({item.category})</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center space-x-2 min-w-[200px]">
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Qtd</Label>
                                    <Input type="number" min="0" value={item.quantity || 1} onChange={e => {
                            const quantity = parseInt(e.target.value) || 1;
                            handleProspectItemChange(index, 'quantity', quantity);
                          }} className="w-16 h-8 text-xs" />
                                  </div>
                                  
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Preço Unit.</Label>
                                    <div className="relative">
                                      <Input type="text" value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : '0,00'} onChange={e => {
                              const value = e.target.value.replace(/\D/g, '');
                              const price = parseFloat(value) / 100;
                              handleProspectItemChange(index, 'price', isNaN(price) ? 0 : price);
                            }} className="w-20 h-8 text-xs pl-4" />
                                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Total</Label>
                                    <div className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                                      R$ {new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format((item.price || 0) * (item.quantity || 1))}
                                    </div>
                                  </div>
                                </div>
                              </div>)}
                          </div>
                       </div>}
                  </div>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integração WhatsApp */}
        <Card className="mt-6">
          <CardHeader>
            
          </CardHeader>
          <CardContent className="space-y-4">
            
          </CardContent>
        </Card>
        {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && <PhotoUpload photos={task.photos || []} onPhotosChange={photos => setTask(prev => ({
        ...prev,
        photos
      }))} maxPhotos={10} />}

        {/* Check-in de Localização - apenas para visita a campo */}
        {taskCategory === 'field-visit' && <CheckInLocation checkInLocation={task.checkInLocation} onCheckIn={handleCheckIn} />}

         <div className="flex flex-col gap-4 mt-6">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Button type="submit" className="flex-1 order-1" variant="gradient" disabled={isSubmitting}>
                <CheckSquare className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Criando...' : 'Criar Tarefa'}
              </Button>
              <Button type="button" variant="outline" className="flex-1 order-2" onClick={handleSaveDraft}>
                <FileText className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Salvar Rascunho</span>
                <span className="sm:hidden">Rascunho</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="flex-1 order-3">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Limpar Tudo</span>
                    <span className="sm:hidden">Limpar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="mx-4">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar limpeza</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja limpar todas as informações do formulário? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      resetAllFields();
                      setSelectedTaskType(null);
                      toast({
                        title: "✨ Formulário limpo",
                        description: "Todas as informações foram resetadas com sucesso"
                      });
                    }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sim, limpar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 order-4"
                onClick={() => navigate('/create-task')}
              >
                Sair
              </Button>
            </div>
           
           {/* Botões de Exportar Relatório */}
           <div className="border-t pt-4">
             <div className="flex items-center justify-between mb-4">
               <div>
                 <h3 className="text-lg font-semibold">Relatórios de Visitas</h3>
                 <p className="text-sm text-muted-foreground">Exporte todas as informações das visitas realizadas</p>
               </div>
             </div>
             <ReportExporter variant="outline" className="w-auto" />
           </div>
         </div>
       </form>}
     </div>;
};
export default CreateTask;