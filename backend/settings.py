import os

try:
    from dotenv import load_dotenv  # pip install python-dotenv  (dev only)
    load_dotenv()
except ImportError:
    pass


def _env(name, default=None):
    """Read an env var (thin wrapper; secrets use this, validated at boot)."""
    return os.environ.get(name, default)

class Config:
    DB_HOST = os.environ.get('DB_HOST', '192.168.1.16') 
    DB_PORT = os.environ.get('DB_PORT', 3306)
    DB_USER = os.environ.get('DB_USER', 'root')  
    DB_PASSWORD = _env('DB_PASSWORD')
    DB_SCHEMA = os.environ.get('DB_SCHEMA', 'Fin_product')
    
    # DB_HOST = os.environ.get('DB_HOST', '103.13.113.132') 
    # DB_PORT = os.environ.get('DB_PORT', 3306)
    # DB_USER = os.environ.get('DB_USER', 'root')  
    # DB_PASSWORD = "Root1234"
    # DB_SCHEMA = os.environ.get('DB_SCHEMA', 'Fin_prod')

    stock_list = ['hdfcbank', 'hindunilvr', 'icicibank', 'infy', 
                  'itc', 'sun_pharma', 'tatamotors', 'tatapower', 'reliance', 
                  'tcs', 'bergepaint', 'sbicard', 'dmart', 
                  'indusindbk', 'bhartiartl', 'indramedco', 
                  'vbl', 'nhpc', 'sjs_enterprise', 'trent', 
                  'bse_limited', 'sharda_corp_chem', 'tips_music', 
                  'karur_vysya_bank', 'kpit_technologies', 'manappuram_finance', 'rvnl', 'innovacap', 'federalbank',
                  'indian_energy_exchange', 'ireda', 'irfc', 'ntpc', 'bel', 'bpcl', 'jiofin', 'jsw_steel', 'adani_power',
                  'ongc', 'coal_india', 'zomato', 'ujjivansfb',
                  'nifty'] # shaktipump
    
    y_fin_stock_list = ['HDFCBANK.NS', 'HINDUNILVR.NS', 'ICICIBANK.NS', 'INFY.NS', 
                        'ITC.NS', 'SUNPHARMA.NS', 'TATAMOTORS.NS', 'TATAPOWER.NS', 'RELIANCE.NS', 
                        'TCS.NS', 'BERGEPAINT.NS', 'SBICARD.NS', 'DMART.NS', 
                        'INDUSINDBK.NS', 'BHARTIARTL.NS', 'INDRAMEDCO.NS', 'VBL.NS', 
                        'NHPC.NS', 'SJS.NS', 'TRENT.NS', 'BSE.NS',
                        'SHARDACROP.NS', 'TIPSMUSIC.NS', 'KARURVYSYA.NS',
                        'KPITTECH.NS', 'MANAPPURAM.NS', 'RVNL.NS', 'INNOVACAP.NS', 'FEDERALBNK.NS', 'IEX.NS', 'IREDA.NS', 
                        'IRFC.NS', 'NTPC.NS', 'BEL.NS', 'BPCL.NS', 'JIOFIN.NS', 'JSWSTEEL.NS', 'ADANIPOWER.NS', 'ONGC.NS', 
                        'COALINDIA.NS', 'ZOMATO.NS', 'UJJIVANSFB.NS', '^NSEI']
    
    db_url = _env('POSTGRES_DATABASE_URL', '')
    TIME_FRAMES_1 = ['monthly', 'weekly', 'daily']
    TIME_FRAMES_2 = ['weekly', 'daily', 'seventy_five', 'sixty'] # 
    TIME_FRAMES_25 = ['weekly', 'daily', 'seventy_five']
    TIME_FRAME_EXE_2 = ['weekly', 'daily', 'sixty']
    TIME_FRAMES_3 = ['daily', 'seventy_five', 'sixty', 'fifteen']

    TIME_FRAMES_4 = ['monthly', 'weekly', 'one_twenty_five']
    TIME_FRAMES_5 = ['weekly', 'daily', 'one_twenty_five']
    TIME_FRAMES_6 = ['daily', 'one_twenty_five', 'twenty_five']

    PROCESSED_DIRECTORY = "./apps/finprod_backend/processed_data_files"
    SCRIPT_CODES = ["1333", "1394", "4963", "1594", "1660", '3351', '3456', "2885", "11536", "404", "17971", "19913", "5258", "10604", "4751", "20000"] # 25578
    DOWNLOAD_TIMEFRAMES = ['monthly', 'weekly', 'daily', '60minute', '15minute']
    NAME_DOWNLOAD_TIMEFRAMES = ['monthly', 'weekly', 'daily', 'sixty', 'fifteen']
    CRUDE_OIL_TIMEFRAMES = ['weekly', 'daily', '240minute', '120minute', '90minute', '60minute']
    EXECUTE_FRAMES = ['daily', 'sixty', 'fifteen']

    stock_enlist_dict = {'hdfc': '03/01/2000', 
                         'hindunilvr': '03/01/2000', 
                         'icicibank': '03/01/2000', 
                         'infy': '03/01/2000', 
                         'itc': '03/01/2000', 
                         'sun_pharma': '03/01/2000', 
                         'tatamotors': '03/01/2000', 
                         'reliance': '03/01/2000', 
                         'tcs': '25/08/2004', 
                         'bergepaint': '03/01/2000',
                         'sbicard': '16/03/2020',
                         'dmart': '20/03/2017',
                         'indusindbk': '03/01/2000',
                         'bhartiartl': '18/02/2002',
                         'indramedco': '03/01/2000',
                         'shaktipump': '24/10/2011',
                         'NIFTY': '03/01/2000',
                         'nifty': '03/01/2000' 
                         }
    
    SQLITE_DB = "./finprod.sqlite" 
    india_data_dir = "./data/indian_stock_data"
    future_data_dir = "./data/indian_stocks_future_data"
    commodity_data_dir = "./data/indian_commodity_data"
    

    us_data_dir = "./data/us_data"

    MARKET_HOLIDAY_URL = "https://www.nseindia.com/api/holiday-master?type=trading"

    RSS_FEED_URL = "https://news.google.com/rss/search?q=stock+market+india&hl=en-IN&gl=IN&ceid=IN:en"
    PUBLISHER_DOMAIN_MAP = {
        "The Economic Times": "economictimes.indiatimes.com",
        "Mint": "livemint.com",
        "The Times of India": "timesofindia.indiatimes.com",
        "Equitymaster": "equitymaster.com",
        "NDTV Profit": "profit.ndtv.com",
        "The Siasat Daily": "siasat.com",
        "Outlook Business": "business.outlookindia.com",
        "India Today": "indiatoday.in",
        "Business Standard": "business-standard.com",
        "Moneycontrol": "moneycontrol.com",
        "CNBCTV18": "cnbctv18.com",
        "BusinessLine": "thehindubusinessline.com",
        "Reuters": "reuters.com",
        "Reuters India": "in.reuters.com",
        "The Financial Express": "financialexpress.com",
        "MSN": "msn.com",
        "Upstox": "upstox.com",
        "Samco": "samco.in"
    }

    FIRECRAWL_API_KEY = _env('FIRECRAWL_API_KEY', '')
    FIRECRAWL_BATCH_EXECUTE_API = "https://news.google.com/_/DotsSplashUi/data/batchexecute"


 
# frame = getattr(f"TIME_FRAME_{1}", "daily")
class stock_logic_config:
    TIME_FRAMES_1 = ['monthly', 'weekly', 'daily']
    TIME_FRAMES_2 = ['weekly', 'daily', 'sixty']
    TIME_FRAMES_3 = ['daily', 'seventy_five', 'sixty', 'fifteen']

    TIME_FRAMES_4 = ['monthly', 'weekly', 'one_twenty_five']
    TIME_FRAMES_5 = ['weekly', 'daily', 'one_twenty_five']
    TIME_FRAMES_6 = ['daily', 'one_twenty_five', 'twenty_five']


    EXECUTE_FRAMES = ['daily', 'sixty', 'fifteen']
    TIME_FRAMES_25 = ['weekly', 'daily', 'seventy_five']
    TIME_FRAME_EXE_1 = ['monthly', 'weekly', 'daily']
    TIME_FRAME_EXE_25 = ['weekly', 'daily', 'seventy_five']
    TIME_FRAME_EXE_2 = ['weekly', 'daily', 'sixty']
    TIME_FRAME_EXE_3 = ['daily', 'sixty', 'fifteen']
    TIME_FRAME_EXE_4 = ['monthly', 'weekly', 'one_twenty_five']
    TIME_FRAME_EXE_5 = ['weekly', 'daily', 'one_twenty_five']
    TIME_FRAME_EXE_6 = ['daily', 'one_twenty_five', 'twenty_five']

    TIME_FRAME_ALL_2 = ['weekly', 'daily', 'seventy_five', 'sixty']

    FUTURE_TIME_FRAME_1 = ['monthly', 'weekly', 'daily']
    FUTURE_TIME_FRAME_25 = ['weekly', 'daily', 'seventy_five']
    FUTURE_TIME_FRAME_2 = ['weekly', 'daily', 'sixty']
    FUTURE_TIME_FRAME_3 = ['daily', 'seventy_five', 'sixty', 'fifteen']
    FUTURE_TIME_FRAME_4 = ['weekly', 'daily', 'one_twenty_five']
    FUTURE_TIME_FRAME_5 = ['daily', 'one_twenty_five', 'twenty_five']

    COMMODITY_TIME_FRAME_1 = ['monthly', 'weekly', 'daily']
    COMMODITY_TIME_FRAME_2 = ['weekly', 'daily', 'two_forty']
    COMMODITY_TIME_FRAME_3 = ['daily', 'two_forty', 'one_twenty']
    COMMODITY_TIME_FRAME_4 = ['daily', 'two_forty', 'sixty']
    

class DB_Config:
    DB_HOST = os.environ.get('DB_HOST', '192.168.1.16') 
    DB_PORT = os.environ.get('DB_PORT', 3306)
    DB_USER = os.environ.get('DB_USER', 'root')
    DB_PASSWORD = _env('DB_PASSWORD')
    DB_SCHEMA = os.environ.get('DB_SCHEMA', 'Fin_product')
    db_config = {
                'host': DB_HOST,
                'user': DB_USER,
                'password': DB_PASSWORD,
                'database': DB_SCHEMA
                }
    
class kite_config:
    api_key = _env('KITE_API_KEY')
    api_secret = _env('KITE_API_SECRET')

class stock_data_dir_config:
    project_root = "."
    indian_stock_data_dir = './data/indian_stock_data'
    indian_stock_future_data_dir = './data/indian_stocks_future_data'
    us_data_dir = './data/us_stock_data'
    indian_commodity_data = './data/indian_commodity_data'
    global_commodity_data = './data/global_commodity_data'
    future_bk_data_dir = './data/future_bk_data'

class stock_model_config:
    indian_buy_model_path = './stock_model/weights/india_model/result_model/best_ensemble_model.pkl'
    indian_buy_model_features_path = './stock_model/weights/india_model/correlated_features.pkl'
    
    indian_sell_model_path = './stock_model/weights/india_model/result_model_INDIA_sell/best_ensemble_model_INDIA.pkl'
    indian_sell_model_features_path = './stock_model/weights/india_model/correlated_features_INDIA_sell.pkl'
    
    indian_buy_60_model_path = './stock_model/weights/india_model/result_model_INDIA_60_BUY/ensemble_model_INDIA_new_logistic_no_pass_sigmoid.pkl'
    indian_buy_60_model_features_path = './stock_model/weights/india_model/correlated_features_INDIA_60_BUY.pkl'

    indian_sell_60_model_path = './stock_model/weights/india_model/result_model_INDIA_60_SELL/best_ensemble_model_INDIA.pkl'
    indian_sell_60_model_features_path = './stock_model/weights/india_model/correlated_features_INDIA_SELL_60.pkl'
    
    indian_buy_75_model_path = './stock_model/weights/india_model/result_model_INDIA_75_BUY/ensemble_model_INDIA_new_logistic_no_pass_sigmoid.pkl'
    indian_buy_75_model_features_path = './stock_model/weights/india_model/correlated_features_INDIA_75_BUY.pkl'

    us_model_path = './stock_model/weights/us_model/result_model/best_rf_model_US.pkl'
    us_model_features_path = './stock_model/weights/us_model/correlated_features_US.pkl'

    model_probability_threshold = 0.6


class fyers_config_credentials:
    CLIENT_ID = _env('FYERS_CLIENT_ID')       # Your Fyers Client ID
    PIN = _env('FYERS_PIN')                # User pin for Fyers account
    APP_ID = _env('FYERS_APP_ID')        # App ID from MyAPI dashboard (https://myapi.fyers.in/dashboard). The format is appId-appType. 
    # Example: YIXXXXXSE-100. In this code, YIXXXXXSE is the APP_ID and 100 is the APP_TYPE
    APP_TYPE = "200"
    APP_SECRET = _env('FYERS_APP_SECRET')   # App Secret from myapi dashboard (https://myapi.fyers.in/dashboard)
    TOTP_SECRET_KEY = _env('FYERS_TOTP_SECRET_KEY')  # TOTP secret key, copy the secret while enabling TOTP.

    REDIRECT_URI = "https://trade.fyers.in/api-login/redirect-uri/index.html"  # Redirect URL from the app
    # API endpoints
    BASE_URL = "https://api-t2.fyers.in/vagator/v2"
    BASE_URL_2 = "https://api-t1.fyers.in/api/v3"
    URL_VERIFY_CLIENT_ID = BASE_URL + "/send_login_otp"
    URL_VERIFY_TOTP = BASE_URL + "/verify_otp"
    URL_VERIFY_PIN = BASE_URL + "/verify_pin"
    URL_TOKEN = BASE_URL_2 + "/token"
    URL_VALIDATE_AUTH_CODE = BASE_URL_2 + "/validate-authcode"
    SUCCESS = 1
    ERROR = -1
    SYMBOL_CSV_URL = "https://public.fyers.in/sym_details/NSE_CM.csv"
    FUTURE_SYMBOL_CSV_URL = "https://public.fyers.in/sym_details/NSE_FO.csv"
    COMMODITY_SYMBOL_CSV_URL = "https://public.fyers.in/sym_details/MCX_COM.csv"


# --- Boot-time secret validation (fail-fast; secrets half of B-W17) -----------
# Call validate_required_config() ONCE at each service entrypoint (before serving
# / before the scheduler starts). Importing this module never fails on missing
# secrets, so tests and tooling can import config without the full secret set.
REQUIRED_SECRETS = [
    'DB_PASSWORD',
    'KITE_API_KEY', 'KITE_API_SECRET',
    'FYERS_CLIENT_ID', 'FYERS_PIN', 'FYERS_APP_ID',
    'FYERS_APP_SECRET', 'FYERS_TOTP_SECRET_KEY'
]


def validate_required_config():
    """Raise if any required secret is unset. Call at each service startup."""
    missing = [name for name in REQUIRED_SECRETS if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
            + ". Set them via the environment (prod) or a gitignored .env (local dev)."
        )