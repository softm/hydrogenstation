import importlib.util
import json
import pathlib
import tempfile
import unittest
import gzip
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('collect',pathlib.Path(__file__).parents[1]/'scripts/collect.py')
c=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(c)
NOW='2026-10-21T00:00:00Z'

def raw(**kw):
    return {'chrstnMno':'001ABC','chrstnNm':'테스트 수소충전소','chrstnAddr':'충남 서산시 도로','geom':'POINT(126.5 36.8)','ntslPc':'9,900','vhcleKndNm':'승용/버스','chrgrTyNm':'800 bar','waitVhcleAlgeCnt':'0','eqpLastMdfcnDt':'202610210850','operLastMdfcnDt':'202610201500','usebhrHrWed':'08:00','useehrHrWed':'24:00',**kw}

class CollectorTests(unittest.TestCase):
    def test_whitelist_never_exports_manager_or_business_identifiers(self):
        s=c.normalize(raw(chrstnPicFlnm='PRIVATE_NAME',chrstnPicEml='PRIVATE_EMAIL',bizrno='PRIVATE_ID'),NOW)
        encoded=json.dumps(s)
        self.assertNotIn('PRIVATE_',encoded)
        self.assertEqual(s['id'],'001ABC')
        self.assertEqual(s['equipmentPressureBar'],800)
        self.assertEqual(s['vehicles'],['car','bus'])
        self.assertEqual(s['waitingTotal'],0)
        self.assertEqual(s['upstreamCheckedAt'],'2026-10-20T23:50:00Z')
        self.assertEqual(s['operationChangedAt'],'2026-10-20T06:00:00Z')
        self.assertEqual(s['hours']['wed']['end'],'24:00')

    def test_unknown_values_and_relative_dates_are_not_zero_or_current(self):
        s=c.normalize(raw(ntslPc='',waitVhcleAlgeCnt='',eqpLastMdfcnDt='3분전',geom='',chrstnAddr='',vhcleKndNm='',vhcleKndCd=''),NOW)
        for key in ['pricePerKg','waitingTotal','lat','lng','upstreamCheckedAt']:self.assertIsNone(s[key])
        self.assertEqual(s['vehicles'],[])
        self.assertIsNone(c.number('NaN'));self.assertIsNone(c.number('1.5',integer=True))

    def test_publication_checks_duplicate_empty_and_large_drop(self):
        row=c.normalize(raw(),NOW)
        for rows in [[],[row,row]]:
            with self.assertRaises(ValueError):c.validate(rows)
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'UNEXPECTED_INVENTORY_DROP'):
                c.publish([row],pathlib.Path(d),NOW,'public-map',{'totalStations':10,'source':{'type':'public-map'}})

    def test_content_addressed_snapshot_and_gzip_are_complete(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);m=c.publish([c.normalize(raw(),NOW)],p,NOW,'public-map')
            self.assertEqual(gzip.decompress((p/m['file']['gzipPath']).read_bytes()),(p/m['file']['path']).read_bytes())
            self.assertEqual(m['totalStations'],1);self.assertEqual(sum(r['count'] for r in m['regions']),1)
            self.assertFalse(m['source']['nationalInventoryVerified'])

    def test_api_requires_success_code_and_total_count(self):
        with self.assertRaises(ValueError):c.api_items({'header':{'resultCode':'30'},'body':{'items':[],'totalCount':0}})
        with self.assertRaisesRegex(ValueError,'API_TOTAL_COUNT_MISMATCH'):
            c.api_items({'header':{'resultCode':'00'},'body':{'totalCount':2,'items':{'item':[{}]}}})
        self.assertEqual(c.api_items({'header':{'resultCode':'00'},'body':{'totalCount':1,'items':{'item':{'id':'01'}}}}),[{'id':'01'}])

    def test_failure_does_not_restamp_last_good_snapshot_or_leak_key(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);c.publish([c.normalize(raw(),NOW)],p,NOW,'public-map')
            original=(p/'manifest.json').read_bytes()
            with patch('sys.argv',['collect','--output',d]),patch.dict('os.environ',{'HYDROGEN_SERVICE_KEY':''}),patch.object(c,'request_json',side_effect=RuntimeError('https://example?serviceKey=PRIVATE_SECRET')):
                self.assertEqual(c.main(),1)
            self.assertEqual((p/'manifest.json').read_bytes(),original)
            attempt=json.loads((p/'collection-status.json').read_text())
            self.assertEqual(attempt['lastSuccessAt'],NOW)
            self.assertNotIn('PRIVATE_SECRET',json.dumps(attempt))

if __name__=='__main__':unittest.main()
