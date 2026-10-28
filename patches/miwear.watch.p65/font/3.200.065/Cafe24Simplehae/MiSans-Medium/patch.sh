set +e
echo INSTALL_START >/data/tmp-patch/install.status
if dd if=/data/tmp-patch/patch.part001 of=/dev/resource bs=65536 seek=1573 count=16 conv=notrunc; then echo W001_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part002 of=/dev/resource bs=65536 seek=1589 count=16 conv=notrunc; then echo W002_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part003 of=/dev/resource bs=65536 seek=1605 count=16 conv=notrunc; then echo W003_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part004 of=/dev/resource bs=65536 seek=1621 count=16 conv=notrunc; then echo W004_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part005 of=/dev/resource bs=65536 seek=1637 count=16 conv=notrunc; then echo W005_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part006 of=/dev/resource bs=65536 seek=1653 count=16 conv=notrunc; then echo W006_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part007 of=/dev/resource bs=65536 seek=1669 count=16 conv=notrunc; then echo W007_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part008 of=/dev/resource bs=65536 seek=1685 count=16 conv=notrunc; then echo W008_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part009 of=/dev/resource bs=65536 seek=1701 count=16 conv=notrunc; then echo W009_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part010 of=/dev/resource bs=65536 seek=1717 count=16 conv=notrunc; then echo W010_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part011 of=/dev/resource bs=65536 seek=1733 count=16 conv=notrunc; then echo W011_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part012 of=/dev/resource bs=65536 seek=1749 count=16 conv=notrunc; then echo W012_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part013 of=/dev/resource bs=65536 seek=1765 count=1 conv=notrunc; then echo W013_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part014 of=/dev/resource bs=16 seek=7233536 count=3933 conv=notrunc; then echo W014_OK >>/data/tmp-patch/install.status; fi
if dd if=/data/tmp-patch/patch.part000 of=/dev/resource bs=16 seek=6439965 count=3043 conv=notrunc; then echo W000_OK >>/data/tmp-patch/install.status; fi
