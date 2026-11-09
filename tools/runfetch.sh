#!/bin/bash
cd /home/user/pokesim/tools
for w in 0 1 2 3 4 5 6 7; do
  ( while true; do python3 fetch.py $w 8 >> fetch$w.log 2>&1; grep -q DONE <(tail -1 fetch$w.log) && break; sleep 5; done ) &
done
wait
