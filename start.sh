#!/bin/bash
python3 generate_config.py
python3 -m http.server 5000 --bind 0.0.0.0
