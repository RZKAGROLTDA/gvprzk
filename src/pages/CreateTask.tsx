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
    { code: "53605", name: "ANDREAS RAUL WUTZKE" }
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