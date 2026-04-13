# PBLAP Data Downloader V1.4 (20240129)
# 抓PBLAP（中大測站）歷史資料
# by Garry

import requests
import pandas as pd
import datetime
import argparse
import sys
import requests.packages.urllib3

requests.packages.urllib3.disable_warnings()

#沒UA會403
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.115 Safari/537.36'
}

#chart_list中的日期格式代碼對應
date_type = {'1': '%Y%m%d%H%M', '2': '%Y-%m-%d-%H-%M', '3': '%Y-%m-%d_%H%M', '4': '%Y%m%d%H%M%S', '5': '%Y-%m%d-%H%M', '6': '%y%m%d%H'}

def get_token():
	#先去原網站拿token，才能用API抓
	r = requests.get('https://obs.pblap.tw/10Marchive.php', headers=headers, verify=False)
	id = r.text.split('id: \'')[1].split("'")[0]
	token = r.text.split('token: \'')[1].split("'")[0]
	return id, token
	
def get_ground_data(id, token, date, days, stno):
	#下載測站資料
	date = date.strftime("%Y-%m-%d")
	if days > 45:
		raise ValueError('Days cannot be more then 45')
	post_data = {
		'from_date': date,
		'days': str(days),
		'stno': str(stno),
		'id': id,
		'token': token
	}
	r = requests.post('https://obs.pblap.tw/script/archive.php', headers=headers, data=post_data, verify=False)
	if not r.ok:
		raise RuntimeError(f'HTTP Error {r.status_code}')
	return r.text
	
def get_chart_id(id, token, tag, date):
	#獲取chart_id
	yyyy = date.strftime("%Y")
	mm = date.strftime("%m")
	dd = date.strftime("%d")
	hh = date.strftime("%H")
	post_data = {
		'tag': tag,
		'yyyy': yyyy,
		'mm': mm,
		'dd': dd,
		'hh': hh,
		'id': id,
		'token': token
	}
	r = requests.post('https://obs.pblap.tw/script/queryFigByDate.php', headers=headers, data=post_data, verify=False)
	data = r.text.split('\n')
	print('Size=', data[1])
	return data[0]
	
def get_chart_list(id, token):
	#獲取圖資資訊
	post_data = {
		'id': id,
		'token': token
	}
	r = requests.post('https://obs.pblap.tw/script/queryFigList2.php', headers=headers, data=post_data, verify=False)
	return r.json()
	
def prase_ground_data(data):
	#解析測站資料並轉為Pandas df
	if data == 'null':
		raise RuntimeError("No data")
	data = data.split('<br>')
	info = data[0].split(',')
	print('Start= ', info[0])
	print('End= ', info[1])
	print('Max Temp= ', info[2])
	print('Min Temp= ', info[3])
	print('Max RH= ', info[4])
	print('Min RH= ', info[5])
	print('Max WS= ', info[6])
	print('Min WS= ', info[7])
	print('Max Pres= ', info[8])
	print('Min Pres= ', info[9])
	print('Max Pircp= ', info[10])
	
	date = data[1].split(',')
	temp = data[2].split(',')
	rh = data[3].split(',')
	wd = data[4].split(',')
	ws = data[5].split(',')
	pres = data[6].split(',')
	precp = data[7].split(',')
	rad = data[8].split(',')
	
	
	for i in range(1441 - len(rad)):
		ws.append('null')
		precp.append('null')
		rad.append('null')
	
	date_range = pd.date_range(datetime.datetime.strptime(info[0], '%Y-%m-%d'), datetime.datetime.strptime(info[1], '%Y-%m-%d'), freq='min')
	for i in range(len(date)):
		date[i] = date_range[i]
	
	count = min(len(date), len(temp), len(rh), len(ws), len(wd), len(pres), len(precp), len(rad))
	data_dict = {
		"datetime": date[:count],
		"temp": temp[:count],
		"rh": rh[:count],
		"ws": ws[:count],
		"wd": wd[:count],
		"p": pres[:count],
		"pr": precp[:count],
		"sr": rad[:count]
	}
	
	df = pd.DataFrame(data_dict)
	df = df.replace('null', None)
	df = df.replace('', None)
	df['temp'] = df['temp'].astype(float)
	df['rh'] = df['rh'].astype(float)
	df['wd'] = df['wd'].astype(float)
	df['ws'] = df['ws'].astype(float)
	df['p'] = df['p'].astype(float)
	df['pr'] = df['pr'].astype(float)
	df['sr'] = df['sr'].astype(float)
	
	return df
	
def download_chart(chart_id):
	#下載圖資
	r = requests.get('https://obs.pblap.tw/script/theImg.php?f=' + chart_id, headers=headers, verify=False)
	return r.content
	
def ground_data(date, days=1, stno=10):
	#地面測站主函式
	id, token = get_token()
	data = get_ground_data(id, token, date, days, stno)
	df = prase_ground_data(data)
	return df
	
def chart_picker(tag, date, path=None):
	#圖資下載主函式
	id, token = get_token()
	chart_id = get_chart_id(id, token, tag, date)
	data = download_chart(chart_id)
	if len(data) == 0:
		raise RuntimeError("No data")
	if path:
		chart_info = get_chart_list(id, token)[tag]
		filename = path + '/' + chart_info['FilenameInit'] + date.strftime(date_type[chart_info['FilenameDateType']]) + chart_info['FilenameTail']
		with open(filename, 'wb') as f:
			f.write(data)
	return data

if __name__ == '__main__':
	class MyParser(argparse.ArgumentParser):
		def error(self, message):
			sys.stderr.write('error: %s\n' % message)
			self.print_help()
			sys.exit(2)

	parser = MyParser(description='Download data and charts from NCU PBLAP.') 
	
	parser.add_argument('--mode', '-m', default='sfc', type=str, help='"sfc" for surface data; "chart" for chart download')
	parser.add_argument('--time', '-t', type=str, required=True, help='Input in format YYYY-MM-DD or YYYY-MM-DD_HH')
	parser.add_argument('--output', '-o', default='./', type=str, help='Output folder')
	parser.add_argument('--code', '-c', default='radar2HD', type=str, help='Chart code')
	parser.add_argument('--days', '-d', default=1, type=int, help='How many days to download (only for surface data)')
	parser.add_argument('--stno', '-s', default=10, type=int, help='Surface data station ID')

	args = parser.parse_args()
	
	try:
		date = datetime.datetime.strptime(args.time, '%Y-%m-%d_%H')
	except:
		try:
			date = datetime.datetime.strptime(args.time, '%Y-%m-%d')
		except:
			raise SyntaxError("Time must be in format 'YYYY-MM-DD' or 'YYYY-MM-DD_HH'")
	
	if args.mode == 'sfc':
		ground_data(date, args.days).to_csv(args.output + '/pblap_sfc_' + args.time.split('_')[0] + '.csv', index=False)
		print('Download finished!')
	elif args.mode == 'chart':
		chart_picker(args.code, date, args.output)
		print('Download finished!')
	else:
		raise ValueError("Mode can only be 'sfc' or 'chart'")