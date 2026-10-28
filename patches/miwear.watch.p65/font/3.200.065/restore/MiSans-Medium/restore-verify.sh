set +e
echo VERIFY_START >/data/tmp-patch/verify.status
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=6439965 count=3043
if cmp /data/tmp-patch/restore.part000 /data/tmp-patch/readback.tmp; then echo V000_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1573 count=16
if cmp /data/tmp-patch/restore.part001 /data/tmp-patch/readback.tmp; then echo V001_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1589 count=16
if cmp /data/tmp-patch/restore.part002 /data/tmp-patch/readback.tmp; then echo V002_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1605 count=16
if cmp /data/tmp-patch/restore.part003 /data/tmp-patch/readback.tmp; then echo V003_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1621 count=16
if cmp /data/tmp-patch/restore.part004 /data/tmp-patch/readback.tmp; then echo V004_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1637 count=16
if cmp /data/tmp-patch/restore.part005 /data/tmp-patch/readback.tmp; then echo V005_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1653 count=16
if cmp /data/tmp-patch/restore.part006 /data/tmp-patch/readback.tmp; then echo V006_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1669 count=16
if cmp /data/tmp-patch/restore.part007 /data/tmp-patch/readback.tmp; then echo V007_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1685 count=16
if cmp /data/tmp-patch/restore.part008 /data/tmp-patch/readback.tmp; then echo V008_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1701 count=16
if cmp /data/tmp-patch/restore.part009 /data/tmp-patch/readback.tmp; then echo V009_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1717 count=16
if cmp /data/tmp-patch/restore.part010 /data/tmp-patch/readback.tmp; then echo V010_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1733 count=16
if cmp /data/tmp-patch/restore.part011 /data/tmp-patch/readback.tmp; then echo V011_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1749 count=16
if cmp /data/tmp-patch/restore.part012 /data/tmp-patch/readback.tmp; then echo V012_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1765 count=1
if cmp /data/tmp-patch/restore.part013 /data/tmp-patch/readback.tmp; then echo V013_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=7233536 count=3933
if cmp /data/tmp-patch/restore.part014 /data/tmp-patch/readback.tmp; then echo V014_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
