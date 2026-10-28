set +e
echo VERIFY_START >/data/tmp-patch/verify.status
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=7237469 count=163
if cmp /data/tmp-patch/patch.part000 /data/tmp-patch/readback.tmp; then echo V000_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1767 count=16
if cmp /data/tmp-patch/patch.part001 /data/tmp-patch/readback.tmp; then echo V001_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1783 count=16
if cmp /data/tmp-patch/patch.part002 /data/tmp-patch/readback.tmp; then echo V002_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1799 count=16
if cmp /data/tmp-patch/patch.part003 /data/tmp-patch/readback.tmp; then echo V003_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1815 count=16
if cmp /data/tmp-patch/patch.part004 /data/tmp-patch/readback.tmp; then echo V004_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1831 count=16
if cmp /data/tmp-patch/patch.part005 /data/tmp-patch/readback.tmp; then echo V005_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1847 count=16
if cmp /data/tmp-patch/patch.part006 /data/tmp-patch/readback.tmp; then echo V006_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1863 count=16
if cmp /data/tmp-patch/patch.part007 /data/tmp-patch/readback.tmp; then echo V007_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=65536 skip=1879 count=8
if cmp /data/tmp-patch/patch.part008 /data/tmp-patch/readback.tmp; then echo V008_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
dd if=/dev/resource of=/data/tmp-patch/readback.tmp bs=16 skip=7729152 count=2419
if cmp /data/tmp-patch/patch.part009 /data/tmp-patch/readback.tmp; then echo V009_OK >>/data/tmp-patch/verify.status; fi
rm /data/tmp-patch/readback.tmp
