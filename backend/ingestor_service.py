import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from data_fetchers.fyers.fyers_ingestor import main
from shared.config.settings import validate_required_config



if __name__ == "__main__":
    validate_required_config()
    main()