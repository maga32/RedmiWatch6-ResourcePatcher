set +e
echo INSTALL_START >/data/tmp-patch/install.status
if dd if=/data/tmp-patch/restore.part001 of=/dev/resource bs=65536 seek=1573 count=16 conv=notrunc; then echo W001_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part002 of=/dev/resource bs=65536 seek=1589 count=16 conv=notrunc; then echo W002_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part003 of=/dev/resource bs=65536 seek=1605 count=16 conv=notrunc; then echo W003_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part004 of=/dev/resource bs=65536 seek=1621 count=16 conv=notrunc; then echo W004_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part005 of=/dev/resource bs=65536 seek=1637 count=16 conv=notrunc; then echo W005_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part006 of=/dev/resource bs=65536 seek=1653 count=16 conv=notrunc; then echo W006_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part007 of=/dev/resource bs=65536 seek=1669 count=16 conv=notrunc; then echo W007_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part008 of=/dev/resource bs=65536 seek=1685 count=16 conv=notrunc; then echo W008_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part009 of=/dev/resource bs=65536 seek=1701 count=16 conv=notrunc; then echo W009_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part010 of=/dev/resource bs=65536 seek=1717 count=16 conv=notrunc; then echo W010_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part011 of=/dev/resource bs=65536 seek=1733 count=16 conv=notrunc; then echo W011_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part012 of=/dev/resource bs=65536 seek=1749 count=16 conv=notrunc; then echo W012_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part013 of=/dev/resource bs=65536 seek=1765 count=2 conv=notrunc; then echo W013_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part014 of=/dev/resource bs=16 seek=7237632 count=157 conv=notrunc; then echo W014_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/restore.part000 of=/dev/resource bs=16 seek=6440285 count=2723 conv=notrunc; then echo W000_OK >>/data/tmp-patch/install.status; fi
