"""Testa o CHECK proposto em PostgreSQL descartável, nunca no banco do GVPS.

Uso: python3 docs/PACOTES_NEGOCIACOES_SNAPSHOTS_TESTE.py <socket-local> <porta>
"""
import json
import subprocess
import sys
from pathlib import Path

sql = Path(__file__).with_name('PACOTES_NEGOCIACOES.sql').read_text()
start = sql.index('  CONSTRAINT projection_negotiation_history_snapshot_valid CHECK')
end = sql.index('\n);', start)
constraint = sql[start:end]

def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

snapshot = {
    'client_id': '10000000-0000-0000-0000-000000000001',
    'cliente': 'Cliente original', 'codigo_cliente': None,
    'responsible_user_id': '20000000-0000-0000-0000-000000000001',
    'responsavel': 'Responsável original', 'titulo': 'Pacote',
    'valor': 850, 'situacao': 'Em negociação', 'observacoes': None,
}
cases = []
for state in ('novo', 'anterior'):
    for code in (None, '', 'C123'):
        data = {**snapshot, 'codigo_cliente': code}
        cases.append((f'{state}: código {code!r}', data if state == 'novo' else snapshot,
                      data if state == 'anterior' else None, '850.00', True))
    for field in ('client_id', 'cliente'):
        for value in (None, ''):
            data = {**snapshot, field: value}
            cases.append((f'{state}: {field} obrigatório {value!r}',
                          data if state == 'novo' else snapshot,
                          data if state == 'anterior' else None, '850.00', False))
    data = {k: v for k, v in snapshot.items() if k != 'codigo_cliente'}
    cases.append((f'{state}: chave código ausente', data if state == 'novo' else snapshot,
                  data if state == 'anterior' else None, '850.00', False))
for json_number, numeric_value in (
    ('0', '0.00'), ('850', '850.00'), ('850.0', '850.00'),
    ('850.00', '850.00'), ('1500000.25', '1500000.25'),
    ('9999999999999999.99', '9999999999999999.99'),
):
    # Preservar números grandes e a escala textual sem passar por ponto flutuante.
    data = json.dumps(snapshot).replace('"valor": 850', f'"valor": {json_number}')
    cases.append((f'moeda {json_number}', data, data, numeric_value, True))
for value in (850.01, '850.00', None):
    data = {**snapshot, 'valor': value}
    for state in ('novo', 'anterior'):
        cases.append((f'{state}: moeda inconsistente {value!r}',
                      data if state == 'novo' else snapshot,
                      data if state == 'anterior' else None, '850.00', False))

def json_sql(value):
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'::jsonb"
    return literal(value)

commands = [f'''BEGIN;
CREATE TEMP TABLE snapshot_test (
  dados_novos jsonb, dados_anteriores jsonb,
  valor_novo numeric(18,2), valor_anterior numeric(18,2),
  responsible_name_novo text, responsible_name_anterior text,
  responsible_user_id_novo uuid, responsible_user_id_anterior uuid,
  situacao_nova text, situacao_anterior text,
{constraint}
);''']
for label, new, old, amount, valid in cases:
    old_sql = 'NULL' if old is None else json_sql(old)
    insert = f'''INSERT INTO snapshot_test VALUES (
      {json_sql(new)}, {old_sql}, {amount}, {amount},
      'Responsável original', 'Responsável original',
      '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      'Em negociação', 'Em negociação');'''
    label = label.replace("'", "''")
    if valid:
        commands.append(insert)
    else:
        commands.append(f'''DO $$ BEGIN
          BEGIN {insert}
          EXCEPTION WHEN check_violation THEN RETURN; END;
          RAISE EXCEPTION 'Caso deveria ser rejeitado: {label}';
        END $$;''')
commands.append(f"SELECT '{len(cases)} casos passaram' AS resultado; ROLLBACK;")
result = subprocess.run(
    ['psql', '-h', sys.argv[1], '-p', sys.argv[2], '-U', 'lovable', '-d', 'postgres',
     '-v', 'ON_ERROR_STOP=1', '-X', '-q'],
    input='\n'.join(commands), text=True, capture_output=True, check=True,
)
print(result.stdout.strip())