"""Entry point for the RNA ladder alignment pipeline.

Reads Sheet1 from a blind_sequencing_result_point_version.xlsx,
validates the data, exports a CSV, and runs both 5' and 3' alignments.

Usage:
    python run_analysis.py \\
        --input   blind_sequencing_result_point_version.xlsx \\
        --theo5   theo_5.csv \\
        --theo3   theo_3.csv \\
        --outdir  results/ \\
        --name    "Sample 01"
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from ladder_alignment_pipeline import AlignConfig, align_ladders, build_excel


REQUIRED_COLS = {
    'base_name', 'monoisotopic_mass', 'sum_intensity',
    'apex_rt', 'n_iteration', 'ladder_number',
}
VALID_BASES   = {'A', 'U', 'G', 'C', 'High'}
SHEET_NAME    = 'Sheet1'


def validate(df):
    msgs, passed = [], True

    def ok(m):   msgs.append(f'OK    {m}')
    def fail(m):
        nonlocal passed
        passed = False
        msgs.append(f'FAIL  {m}')

    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        fail(f'missing columns: {missing}')
        return False, msgs

    ok('all required columns present')

    nulls = df[list(REQUIRED_COLS)].isnull().sum()
    if nulls.any():
        fail(f'null values: {nulls[nulls > 0].to_dict()}')
    else:
        ok('no nulls in required columns')

    unexpected = set(df['base_name'].unique()) - VALID_BASES
    if unexpected:
        fail(f'unexpected base_name values: {unexpected}')
    else:
        ok(f"base_name values: {sorted(df['base_name'].unique())}")

    high_counts = df[df['base_name'] == 'High'].groupby('ladder_number').size()
    bad_highs   = high_counts[high_counts != 1]
    if len(bad_highs):
        fail(f'ladders without exactly 1 High calibrant: {bad_highs.to_dict()}')
    else:
        ok('each ladder has exactly 1 High calibrant')

    if df['monoisotopic_mass'].min() <= 0:
        fail('monoisotopic_mass contains non-positive values')
    else:
        ok(f"mass range: {df['monoisotopic_mass'].min():.1f} - "
           f"{df['monoisotopic_mass'].max():.1f} Da")

    ok(f"ladders: {df['ladder_number'].nunique()}  rows: {len(df)}")
    return passed, msgs


def main():
    parser = argparse.ArgumentParser(description='RNA ladder alignment - full run')
    parser.add_argument('--input',  required=True)
    parser.add_argument('--theo5',  required=True)
    parser.add_argument('--theo3',  required=True)
    parser.add_argument('--outdir', default='.')
    parser.add_argument('--name',   default='sample')
    parser.add_argument('--order',  default='row_order')
    args = parser.parse_args()

    outdir    = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    safe_name = args.name.replace(' ', '_')

    print(f'input:  {args.input}')
    try:
        sheets = pd.read_excel(args.input, sheet_name=None)
    except Exception as e:
        sys.exit(f'cannot read xlsx: {e}')

    if SHEET_NAME not in sheets:
        sys.exit(f"sheet '{SHEET_NAME}' not found; available: {list(sheets.keys())}")

    df = sheets[SHEET_NAME]
    print(f'sheet1: {df.shape[0]} rows x {df.shape[1]} cols')

    passed, msgs = validate(df)
    report_path  = outdir / f'{safe_name}_validation_report.txt'
    report_path.write_text('\n'.join([
        f'validation report: {args.name}',
        f'generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
        f'result: {"PASSED" if passed else "FAILED"}',
        '',
    ] + msgs))
    for m in msgs:
        print(f'  {m}')
    if not passed:
        print(f'validation failed; see {report_path}')
        sys.exit(1)
    print(f'validation passed  ({report_path})')

    csv_path = outdir / f'{safe_name}_ladder_data.csv'
    df[list(REQUIRED_COLS)].to_csv(csv_path, index=False)
    print(f'csv:    {csv_path}')

    try:
        theo5 = pd.read_csv(args.theo5)
        theo3 = pd.read_csv(args.theo3)
    except Exception as e:
        sys.exit(f'cannot read theo files: {e}')
    print(f'theo5:  {len(theo5)} positions')
    print(f'theo3:  {len(theo3)} positions')

    cfg = AlignConfig(order_strategy=args.order)
    from collections import Counter

    for direction, theo in [('5', theo5), ('3', theo3)]:
        order, meta, maps = align_ladders(df, theo, cfg, direction=direction)
        cc  = Counter(v['overall'] for v in meta.values())
        adj = sum(1 for v in meta.values() if v['pos_adjusted'])
        out = outdir / f'{safe_name}_alignment_{direction}prime.xlsx'
        build_excel(order, meta, maps, theo, direction, args.name, str(out))
        print(f"{direction}': perfect={cc['perfect']+cc['mixed']}  "
              f"shifted={cc['shifted']}  "
              f"noisy={cc['noisy_shifted']+cc['noisy_mixed']}  "
              f"rejected={cc['rejected']}  "
              f"normal={cc['normal']}  pos_adj={adj}  -> {out}")

    print('done.')


if __name__ == '__main__':
    main()
