set +e
echo INSTALL_START >/data/tmp-patch/install.status
if dd if=/data/tmp-patch/restore.part001 of=/dev/resource bs=65536 seek=1388 count=16 conv=notrunc; then echo W001_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part002 of=/dev/resource bs=65536 seek=1404 count=16 conv=notrunc; then echo W002_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part003 of=/dev/resource bs=65536 seek=1420 count=16 conv=notrunc; then echo W003_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part004 of=/dev/resource bs=65536 seek=1436 count=16 conv=notrunc; then echo W004_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part005 of=/dev/resource bs=65536 seek=1452 count=16 conv=notrunc; then echo W005_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part006 of=/dev/resource bs=65536 seek=1468 count=16 conv=notrunc; then echo W006_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part007 of=/dev/resource bs=65536 seek=1484 count=16 conv=notrunc; then echo W007_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part008 of=/dev/resource bs=65536 seek=1500 count=16 conv=notrunc; then echo W008_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part009 of=/dev/resource bs=65536 seek=1516 count=16 conv=notrunc; then echo W009_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part010 of=/dev/resource bs=65536 seek=1532 count=16 conv=notrunc; then echo W010_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part011 of=/dev/resource bs=65536 seek=1548 count=16 conv=notrunc; then echo W011_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part012 of=/dev/resource bs=65536 seek=1564 count=8 conv=notrunc; then echo W012_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part013 of=/dev/resource bs=16 seek=6438912 count=1373 conv=notrunc; then echo W013_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part000 of=/dev/resource bs=16 seek=5682045 count=3203 conv=notrunc; then echo W000_OK >>/data/tmp-patch/install.status; fi
