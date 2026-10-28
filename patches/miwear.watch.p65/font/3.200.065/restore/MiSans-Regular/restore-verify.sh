set +e
echo VERIFY_START >/data/tmp-patch/verify.status
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=5681725 count=3523
if cmp /data/tmp-patch/restore.part000 /data/tmp-patch/readback.tmp; then echo V000_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1388 count=16
if cmp /data/tmp-patch/restore.part001 /data/tmp-patch/readback.tmp; then echo V001_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1404 count=16
if cmp /data/tmp-patch/restore.part002 /data/tmp-patch/readback.tmp; then echo V002_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1420 count=16
if cmp /data/tmp-patch/restore.part003 /data/tmp-patch/readback.tmp; then echo V003_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1436 count=16
if cmp /data/tmp-patch/restore.part004 /data/tmp-patch/readback.tmp; then echo V004_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1452 count=16
if cmp /data/tmp-patch/restore.part005 /data/tmp-patch/readback.tmp; then echo V005_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1468 count=16
if cmp /data/tmp-patch/restore.part006 /data/tmp-patch/readback.tmp; then echo V006_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1484 count=16
if cmp /data/tmp-patch/restore.part007 /data/tmp-patch/readback.tmp; then echo V007_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1500 count=16
if cmp /data/tmp-patch/restore.part008 /data/tmp-patch/readback.tmp; then echo V008_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1516 count=16
if cmp /data/tmp-patch/restore.part009 /data/tmp-patch/readback.tmp; then echo V009_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1532 count=16
if cmp /data/tmp-patch/restore.part010 /data/tmp-patch/readback.tmp; then echo V010_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1548 count=16
if cmp /data/tmp-patch/restore.part011 /data/tmp-patch/readback.tmp; then echo V011_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1564 count=8
if cmp /data/tmp-patch/restore.part012 /data/tmp-patch/readback.tmp; then echo V012_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=6438912 count=1053
if cmp /data/tmp-patch/restore.part013 /data/tmp-patch/readback.tmp; then echo V013_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
