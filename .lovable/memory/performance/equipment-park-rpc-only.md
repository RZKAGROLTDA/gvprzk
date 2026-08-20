---
name: Parque de Máquinas via RPC apenas
description: Listagem do Parque de Máquinas deve usar get_equipment_park_paginated, nunca SELECT direto com count exact
type: constraint
---
A tela `/equipamentos` (hook `useEquipmentPark`) deve sempre usar a RPC
`get_equipment_park_paginated`, que cobre todos os filtros da UI
(p_search, p_client_code, p_client_name, p_machine_type, p_machine_status,
p_puk_status, p_validation_priority, p_filial_id, p_validated_by uuid[])
e devolve `total_count` server-side.

Proibido: fallback para `supabase.from('client_equipment').select(..., { count: 'exact' })`
— custava ~4,8 s por chamada e consumia Disk IO. O hook `useEquipmentSearch`
foi removido por esse motivo.

`get_equipment_validation_summary()` agrega em passada única com
`GROUP BY ROLLUP(filial_nome)` (~22 ms). Ela é STABLE e **não** é
SECURITY DEFINER — manter assim para não alterar o universo visível.
